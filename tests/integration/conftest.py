"""Integration test harness for the Tontine contract.

These tests run the contract through real consensus on a local glsim network
with a live Anthropic model. Source pages are served as fixed, in-memory web
mocks installed through glsim's sim_installMocks RPC, so the resolver sees
deterministic content while the LLM call itself is real. That split is what
makes the prompt injection test meaningful: the model, not a canned response,
decides the outcome.

Requirements:
  - ANTHROPIC_API_KEY in the environment or in the repo .env file
  - glsim on PATH (pip install genlayer-test[sim])

The model defaults to a Haiku tier to keep latency and cost low and can be
overridden with GLSIM_LLM_MODEL.
"""

import json
import os
import shutil
import socket
import subprocess
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import pytest

RPC_URL = "http://127.0.0.1:4000/api"
RPC_PORT = 4000
# Leader-only by default. glsim re-derives state across validator rotations,
# and real-model variance on the eq_principle comparison can trigger a rotation
# whose storage restore leaves a stateful, nondet method (request_resolution)
# seeing already-mutated state. Override with GLSIM_VALIDATORS to exercise the
# multi-validator path.
GLSIM_VALIDATORS = int(os.environ.get("GLSIM_VALIDATORS", "1"))
LLM_MODEL = os.environ.get("GLSIM_LLM_MODEL", "claude-haiku-4-5")

MIN_STAKE = 10 ** 16
CREATION_FEE = 10 ** 18
HOUR = 3600
FUND_AMOUNT = 1000 * 10 ** 18

REPO_ROOT = Path(__file__).resolve().parents[2]

_schema_cache = {}


def _load_env_file():
    """Load KEY=VALUE pairs from the repo .env into os.environ if not set."""
    env_path = REPO_ROOT / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        os.environ.setdefault(key, value)


def _port_open(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def rpc(method: str, params=None):
    """Send a JSON-RPC request to the running glsim node."""
    payload = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params or []}
    ).encode("utf-8")
    req = urllib.request.Request(
        RPC_URL, data=payload, headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    if "error" in body and body["error"]:
        raise RuntimeError(f"RPC {method} failed: {body['error']}")
    return body.get("result")


@pytest.fixture(autouse=True)
def glsim_server():
    """Launch a fresh glsim node with a live Anthropic provider per test.

    Per-test isolation keeps the number of contract loads in any one node low.
    The schema path re-imports the contract so the clock stays warpable, and
    repeated re-imports in a single long-lived node eventually corrupt the SDK's
    storage-type registration; a fresh node per test avoids that.
    """
    _load_env_file()

    if not os.environ.get("ANTHROPIC_API_KEY"):
        pytest.skip("ANTHROPIC_API_KEY is required for integration tests")
    if shutil.which("glsim") is None:
        pytest.skip("glsim is not installed (pip install genlayer-test[sim])")

    if _port_open("127.0.0.1", RPC_PORT):
        # A node is already running; reuse it rather than fighting for the port.
        _warm_schema_cache()
        yield
        return

    import sys

    launcher = Path(__file__).resolve().parent / "_glsim_launcher.py"
    env = os.environ.copy()
    env["GLSIM_SDK_CONTRACT"] = str(REPO_ROOT / "contracts" / "tontine.py")
    env["GLSIM_PORT"] = str(RPC_PORT)
    env["GLSIM_VALIDATORS"] = str(GLSIM_VALIDATORS)
    env["GLSIM_LLM_MODEL"] = LLM_MODEL
    proc = subprocess.Popen(
        [sys.executable, str(launcher)],
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        deadline = time.time() + 40
        while time.time() < deadline:
            if _port_open("127.0.0.1", RPC_PORT):
                try:
                    rpc("sim_getTime")
                    break
                except Exception:
                    pass
            if proc.poll() is not None:
                raise RuntimeError("glsim exited during startup")
            time.sleep(0.5)
        else:
            raise RuntimeError("glsim did not become ready in time")
        _warm_schema_cache()
        yield
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=10)
        except subprocess.TimeoutExpired:
            proc.kill()


def addr(value):
    """Wrap a hex address or account so it encodes as a calldata Address.

    Plain strings reach the contract as str and break Address typed parameters,
    so every Address argument must go through this.
    """
    from genlayer_py.types import CalldataAddress

    hex_value = value.address if hasattr(value, "address") else value
    return CalldataAddress(hex_value)


def fund(address: str, amount: int = FUND_AMOUNT):
    rpc("sim_fundAccount", [address, amount])


def _warm_schema_cache():
    """Fetch the contract schema once, before any deploy, and cache it.

    The node's schema RPC reliably returns the full method set on a fresh node
    but can return an empty set once deploys have run, so we capture it up front
    and reuse it. The contract factory also packages the source before asking
    for its schema and gets an empty set in that form, which is why the deployed
    Contract needs methods bound explicitly.
    """
    code = (REPO_ROOT / "contracts" / "tontine.py").read_bytes().hex()
    for _ in range(10):
        schema = rpc("gen_getContractSchemaForCode", ["0x" + code])
        if schema and schema.get("methods"):
            _schema_cache["schema"] = schema
            return


def bind_methods(contract):
    """Attach the contract's full method set to a deployed Contract instance."""
    schema = _schema_cache.get("schema")
    if not schema or not schema.get("methods"):
        raise RuntimeError("contract schema unavailable from node")
    contract._schema = schema
    contract._build_methods_from_schema()
    return contract


def install_mocks(pages, llm=None):
    """Serve fixed web content, and optionally fixed LLM responses.

    `pages` maps an exact source URL to a response dict such as
    {"status": 200, "body": "..."}. URL keys are escaped so they match the URL
    literally. `llm` maps a prompt substring pattern to a response string; when
    omitted the LLM stays live so the real model decides the outcome.
    """
    import re

    web_mocks = {re.escape(url): resp for url, resp in pages.items()}
    rpc(
        "sim_installMocks",
        {"web_mocks": web_mocks, "llm_mocks": llm or {}, "strict": False},
    )


def clear_mocks():
    rpc("sim_installMocks", {"web_mocks": {}, "llm_mocks": {}, "strict": False})


def set_time_epoch(epoch: int):
    iso = datetime.fromtimestamp(epoch, tz=timezone.utc).isoformat().replace("+00:00", "Z")
    rpc("sim_setTime", [iso])


def advance_past(epoch_deadline: int, slack: int = 7200):
    """Move the node clock well past the given epoch deadline.

    A wide margin is used because the write transaction recomputes effective
    time from the wall clock plus the offset at execution, which can land just
    short of a tight deadline.
    """
    set_time_epoch(int(epoch_deadline) + slack)
