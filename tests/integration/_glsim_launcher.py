"""Launch glsim with in-process compatibility shims, then hand off to glsim.

glsim runs the contract in native Python and reuses the gltest direct-mode
runner, so running this Address-heavy, payable, time-gated contract through it
needs several adjustments. Each is applied in this process only; installed
packages are untouched. The fixes:

  - Address calldata bridge. glsim decodes calldata with genlayer_py (producing
    CalldataAddress) but the runner re-encodes and compares with the genvm SDK
    Address type, which do not interoperate. We convert decoded CalldataAddress
    values to SDK Address on the way in, and SDK Address back to CalldataAddress
    on the way out (results).
  - genlayer.gl preimport. The SDK reads its message from fd 0 at import time;
    we import it once against a dummy message so the cache is clean.
  - VM teardown. The direct-mode teardown evicts the SDK from sys.path, which
    breaks a long-lived server; we keep the stdin restore and skip the eviction.
  - Schema clock. Schema extraction imports the contract under a throwaway VM,
    freezing its clock; we skip caching that class so the deploy re-imports it
    under the engine VM, keeping the clock warpable.
  - Write time. glsim ignores the global time offset on writes; we make it
    authoritative so time-gated methods see the advanced clock.
  - Value. glsim does not set the transaction value on the message; we stage it
    so payable methods see gl.message.value.
  - LLM JSON. glsim's Anthropic handler returns the model text verbatim; we pull
    the JSON object out of it so the contract receives the dict it expects.

Invoked as a subprocess by the integration conftest; configured through env.
"""

import os
import sys
from pathlib import Path

GLTEST_CACHE = Path.home() / ".cache" / "gltest-direct"
LINTER_CACHE = Path.home() / ".cache" / "genvm-linter"

_runtime = {"Address": None}


def _seed_sdk_cache():
    GLTEST_CACHE.mkdir(parents=True, exist_ok=True)
    if list(GLTEST_CACHE.glob("genvm-universal-*.tar.xz")):
        return
    candidates = sorted(LINTER_CACHE.glob("genvm-universal-*.tar.xz"), reverse=True)
    if candidates:
        target = GLTEST_CACHE / candidates[0].name
        if not target.exists():
            target.symlink_to(candidates[0])


def _setup_sdk_path():
    """Put the contract's SDK on sys.path so genlayer is importable up front."""
    from gltest.direct.sdk_loader import setup_sdk_paths

    setup_sdk_paths(Path(os.environ["GLSIM_SDK_CONTRACT"]))


def _ensure_runtime():
    """Resolve the SDK Address type once it is importable."""
    if _runtime["Address"] is None:
        from genlayer.py.types import Address

        _runtime["Address"] = Address
    return _runtime["Address"]


def _preimport_genlayer_gl():
    """Import genlayer.gl with a valid message on fd 0.

    genlayer._internal.msg decodes the transaction message from fd 0 at import
    time. glsim imports genlayer.gl lazily during the first deploy, before a
    message is in place, so the decode hits empty input and fails. Importing it
    once here against a dummy message caches the module cleanly; the runner
    refreshes the real sender on each transaction afterwards. The engine has
    already installed its wasi stub by the time this runs, so genlayer.gl binds
    the correct one.
    """
    import tempfile

    # genlayer.gl binds _genlayer_wasi at import. Use gltest's wasi module, the
    # same one the engine routes through, so calls reach the active VM context.
    import gltest.direct.wasi_mock as wasi_mock

    sys.modules.setdefault("_genlayer_wasi", wasi_mock)

    from genlayer.py import calldata
    from genlayer.py.types import Address

    zero = Address(b"\x00" * 20)
    message = {
        "contract_address": zero,
        "sender_address": zero,
        "origin_address": zero,
        "stack": [],
        "value": 0,
        "datetime": "2030-01-01T00:00:00Z",
        "is_init": False,
        "chain_id": 61127,
        "entry_kind": 0,
        "entry_data": b"",
        "entry_stage_data": None,
    }
    encoded = calldata.encode(message)

    fd, path = tempfile.mkstemp()
    os.write(fd, encoded)
    os.lseek(fd, 0, os.SEEK_SET)
    saved = os.dup(0)
    os.dup2(fd, 0)
    os.close(fd)
    try:
        import genlayer.gl  # noqa: F401  (imported for its caching side effect)
    finally:
        os.dup2(saved, 0)
        os.close(saved)
        os.unlink(path)


def _patch_vm_cleanup():
    """Stop the direct-mode VM teardown from evicting the SDK.

    gltest's VMContext._cleanup_after_deactivate removes the SDK from sys.path
    and drops every genlayer.* module after a context deactivates. In a one shot
    direct test that is fine, but glsim is a long-running server that reuses the
    SDK across requests, and a transient context (such as a schema fetch) would
    otherwise leave later transactions unable to import genlayer. We keep the
    stdin restore and skip the eviction.
    """
    import os as _os

    from gltest.direct.vm import VMContext

    def _cleanup(self):
        stdin_fd = getattr(self, "_original_stdin_fd", None)
        if stdin_fd is not None:
            try:
                _os.dup2(stdin_fd, 0)
                _os.close(stdin_fd)
            except OSError:
                pass
            self._original_stdin_fd = None

    VMContext._cleanup_after_deactivate = _cleanup


def _install_address_patch():
    import glsim.engine as engine
    import glsim.server as server
    from glsim.tx_decoder import decode_calldata_bytes as original

    def _convert(value, Address):
        if type(value).__name__ == "CalldataAddress":
            return Address(value.as_bytes)
        if isinstance(value, list):
            return [_convert(item, Address) for item in value]
        if isinstance(value, tuple):
            return tuple(_convert(item, Address) for item in value)
        if isinstance(value, dict):
            return {key: _convert(item, Address) for key, item in value.items()}
        return value

    def wrapped(raw):
        decoded = original(raw)
        Address = _ensure_runtime()
        if isinstance(decoded, dict):
            if "args" in decoded:
                decoded["args"] = [_convert(arg, Address) for arg in decoded["args"]]
            if "kwargs" in decoded:
                decoded["kwargs"] = {k: _convert(v, Address) for k, v in decoded["kwargs"].items()}
        return decoded

    engine.decode_calldata_bytes = wrapped
    server.decode_calldata_bytes = wrapped


def _install_result_patch():
    """Teach the genlayer_py encoder to accept SDK Address values.

    Reads encode their return value with genlayer_py, which does not recognise
    the genvm SDK Address type, so any view returning an Address (or a struct
    containing one, such as a Pool) fails to serialize. Patching the encoder
    entry point covers every result path: we convert SDK Address to
    CalldataAddress and expand dataclasses before the original encoder runs.
    """
    import collections.abc as abc
    import dataclasses

    import genlayer_py.abi.calldata as gp_calldata

    original_encode = gp_calldata.encode

    def _convert(value):
        if type(value).__name__ == "Address" and hasattr(value, "as_bytes"):
            from genlayer_py.types import CalldataAddress

            return CalldataAddress(value.as_bytes)
        if isinstance(value, (str, bytes, bytearray)):
            return value
        if isinstance(value, abc.Mapping):
            return {key: _convert(item) for key, item in value.items()}
        # Views return dataclasses (Pool, PoolSummary, ...) whose fields include
        # Address, and storage containers (DynArray) that are sequences rather
        # than lists. Expand both so every nested Address is reached.
        if dataclasses.is_dataclass(value) and not isinstance(value, type):
            return {f.name: _convert(getattr(value, f.name)) for f in dataclasses.fields(value)}
        if isinstance(value, abc.Sequence):
            return [_convert(item) for item in value]
        return value

    def encode(value):
        return original_encode(_convert(value))

    gp_calldata.encode = encode


def _install_schema_cache_patch():
    """Stop schema extraction from caching a contract class with a frozen clock.

    get_sdk_schema_for_code imports the contract inside a throwaway VMContext to
    read its schema, then caches that class for deploy to reuse. The contract
    binds datetime.now at import, so the cached class has a dead clock and the
    simulated time never reaches _now(), leaving time-gated methods reverting.
    Skipping the cache makes the deploy re-import the contract under the engine's
    persistent VM, where the clock stays warpable. Storage isolation is kept
    because the schema load still uses its own VMContext.
    """
    import tempfile
    from pathlib import Path as _Path

    import glsim.engine as engine_mod
    from glsim.engine import VMContext

    def get_sdk_schema_for_code(self, code):
        import hashlib

        code_hash = hashlib.sha256(code).hexdigest()[:16]
        cached = self._code_hash_cache.get(code_hash)
        if cached is not None:
            return self._extract_sdk_schema(cached)

        tmp_path = str(_Path(tempfile.gettempdir()) / f"glsim_contract_{code_hash}.py")
        _Path(tmp_path).write_bytes(code)
        path = _Path(tmp_path).resolve()

        from gltest.direct.loader import load_contract_class

        self._reset_contract_registry()
        vm = VMContext()
        with vm.activate():
            cls = load_contract_class(path, vm, sdk_version=None)
        self._reset_contract_registry()
        return self._extract_sdk_schema(cls)

    engine_mod.SimEngine.get_sdk_schema_for_code = get_sdk_schema_for_code


def _install_time_patch():
    """Make sim_setTime authoritative for writes as well as reads.

    glsim's time context prefers a per-transaction genvm_datetime over the
    global offset, and the SDK stamps writes with the real wall time, so a
    sim_setTime advance is ignored for write transactions and time-gated methods
    revert. We flip the precedence: when a global offset is set, warp to it.
    """
    import glsim.server as server

    def _apply_time_context(engine, state, sim_config=None):
        if state._time_offset_seconds != 0:
            engine.vm.warp(state.get_effective_datetime())
            return
        if sim_config and isinstance(sim_config, dict):
            genvm_dt = sim_config.get("genvm_datetime")
            if genvm_dt:
                engine.vm.warp(str(genvm_dt))

    server._apply_time_context = _apply_time_context


def _install_llm_json_patch():
    """Parse JSON out of the model response for response_format='json' prompts.

    Production enforces JSON output, but glsim's Anthropic handler does not, so a
    model that wraps its JSON in prose or markdown fences comes back as a plain
    string and the contract's json.loads(...).get(...) fails. We post-process the
    live handler's result: when it is a string, pull the JSON object out of it so
    the contract receives the dict it expects, matching production behaviour.
    """
    import json
    import re

    import glsim.live_io as live_io

    original_factory = live_io.create_llm_handler

    def _extract_json(text):
        fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        candidate = fenced.group(1) if fenced else None
        if candidate is None:
            start = text.find("{")
            end = text.rfind("}")
            candidate = text[start : end + 1] if start != -1 and end > start else None
        if candidate is None:
            return None
        try:
            return json.loads(candidate)
        except (ValueError, TypeError):
            return None

    def create_llm_handler(provider_config=None):
        handler = original_factory(provider_config)

        def wrapped(data):
            resp = handler(data)
            if isinstance(resp, dict) and isinstance(resp.get("ok"), str):
                parsed = _extract_json(resp["ok"])
                if parsed is not None:
                    return {"ok": parsed}
            return resp

        return wrapped

    live_io.create_llm_handler = create_llm_handler


def _install_value_patch(engine):
    """Propagate a transaction's native value into gl.message.value.

    glsim decodes the eth transaction value but never sets it on the execution
    message, so every payable method sees value 0. We read the value off the
    raw transaction and stage it on the VM before the call runs; the runner's
    sender refresh then carries it into gl.message.value. Reset afterwards so a
    later zero-value call does not inherit a stale amount.
    """
    import glsim.server as server
    from glsim.tx_decoder import decode_raw_transaction

    original = server.RPC_METHODS["eth_sendRawTransaction"]

    def wrapped(state, eng, params):
        try:
            raw = params.get(0) if isinstance(params, dict) else params[0]
            engine.vm._value = int(decode_raw_transaction(raw).get("value", 0))
        except Exception:
            engine.vm._value = 0
        try:
            return original(state, eng, params)
        finally:
            engine.vm._value = 0

    server.RPC_METHODS["eth_sendRawTransaction"] = wrapped


def main():
    _seed_sdk_cache()
    _setup_sdk_path()
    _patch_vm_cleanup()
    _install_address_patch()

    from glsim.server import create_app, run_server
    from glsim.state import DEFAULT_CHAIN_ID

    # Must run before create_app, which imports create_llm_handler from live_io.
    _install_llm_json_patch()

    model = os.environ.get("GLSIM_LLM_MODEL", "claude-haiku-4-5")
    app = create_app(
        num_validators=int(os.environ.get("GLSIM_VALIDATORS", "2")),
        max_rotations=3,
        chain_id=DEFAULT_CHAIN_ID,
        llm_provider=f"anthropic:{model}",
        use_browser=False,
        verbose=False,
        seed="42",
    )
    # The engine is now active and its wasi stub installed, so genlayer.gl can
    # be imported cleanly before any transaction arrives.
    _preimport_genlayer_gl()
    _install_result_patch()
    _install_schema_cache_patch()
    _install_time_patch()
    _install_value_patch(app.state.engine)
    run_server(app, host="127.0.0.1", port=int(os.environ.get("GLSIM_PORT", "4000")))


if __name__ == "__main__":
    main()
