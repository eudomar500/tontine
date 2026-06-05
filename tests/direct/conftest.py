"""Shared fixtures and helpers for Tontine direct mode tests.

The fixtures here return genlayer Address objects rather than the raw byte
strings produced by the stock gltest fixtures. The contract takes an Address
constructor argument and stores Address values, both of which require the
calldata layer to recognise the type. The stock create_address helper falls
back to raw bytes when the SDK is not yet on sys.path at fixture resolution
time, so we load the SDK first and build proper Address instances.
"""

import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

CONTRACT = "contracts/tontine.py"

MIN_STAKE = 10 ** 16
CREATION_FEE = 10 ** 18
HOUR = 3600
DAY = 86400

BASE_ISO = "2030-01-01T00:00:00Z"


GLTEST_CACHE = Path.home() / ".cache" / "gltest-direct"
LINTER_CACHE = Path.home() / ".cache" / "genvm-linter"


def _contract_path() -> Path:
    return Path(CONTRACT).resolve()


def _seed_sdk_cache():
    """Make sure the direct runner has a usable genvm tarball to extract from.

    The runner resolves an SDK version by following the GitHub `latest`
    release, but the most recent releases no longer ship genvm-universal.tar.xz,
    so that lookup 404s. The genvm linter pins and downloads a release that does
    carry the tarball; reuse it by linking it into the runner's own cache. Once
    any tarball is present the runner picks the newest cached version and never
    touches the network.
    """
    GLTEST_CACHE.mkdir(parents=True, exist_ok=True)
    if list(GLTEST_CACHE.glob("genvm-universal-*.tar.xz")):
        return
    candidates = sorted(LINTER_CACHE.glob("genvm-universal-*.tar.xz"), reverse=True)
    if not candidates:
        return
    source = candidates[0]
    target = GLTEST_CACHE / source.name
    if not target.exists():
        target.symlink_to(source)


def _load_sdk():
    """Ensure the contract's SDK version is importable in this process."""
    _seed_sdk_cache()
    from gltest.direct.sdk_loader import setup_sdk_paths

    setup_sdk_paths(_contract_path())


_seed_sdk_cache()


def _patch_inmem_allocate():
    """Work around a bug in the pinned SDK's storage.inmem_allocate.

    For a parametrized container such as DynArray[Outcome] the descriptor's
    `cls` resolves to the typing generic alias, whose __init__ is
    _GenericAlias.__init__ and requires an `args` argument. inmem_allocate
    builds the instance via td.get() and then unconditionally invokes that
    __init__, which raises TypeError for every container type. The container
    is already fully constructed at that point, so the only correct behaviour
    is to skip the call. Real storage dataclass inits are tagged with
    ORIGINAL_INIT_ATTR, which lets us tell the two apart and still run a
    genuine user __init__ when one exists.

    The SDK modules are reloaded for each test, so this is reapplied per
    deploy rather than once at import.
    """
    import genlayer.py.storage as storage
    from genlayer.py.storage._internal.generate import (
        ORIGINAL_INIT_ATTR,
        _storage_build,
        Lit,
    )
    from genlayer.py.storage._internal.core import InmemManager, ROOT_SLOT_ID

    if getattr(storage, "_inmem_allocate_patched", False):
        return

    def inmem_allocate(t, *init_args, **init_kwargs):
        td = _storage_build(t, {})
        assert not isinstance(td, Lit)
        instance = td.get(InmemManager().get_store_slot(ROOT_SLOT_ID), 0)

        cls = getattr(td, "cls", None)
        init = getattr(cls, "__init__", None) if cls is not None else getattr(t, "__init__", None)
        if init is not None and hasattr(init, ORIGINAL_INIT_ATTR):
            getattr(init, ORIGINAL_INIT_ATTR)(instance, *init_args, **init_kwargs)
        return instance

    storage.inmem_allocate = inmem_allocate
    storage._inmem_allocate_patched = True

    import genlayer.gl as gl_mod

    gl_storage = getattr(gl_mod, "storage", None)
    if gl_storage is not None and gl_storage is not storage:
        gl_storage.inmem_allocate = inmem_allocate


def make_address(seed: str):
    """Build a deterministic Address from a seed string."""
    _load_sdk()
    from genlayer.py.types import Address

    return Address(hashlib.sha256(seed.encode()).digest()[:20])


def zero_address():
    _load_sdk()
    from genlayer.py.types import Address

    return Address(b"\x00" * 20)


def to_iso(epoch: int) -> str:
    return (
        datetime.fromtimestamp(epoch, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )


def to_epoch(iso: str) -> int:
    return int(datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp())


BASE_EPOCH = to_epoch(BASE_ISO)


@pytest.fixture
def base_epoch() -> int:
    return BASE_EPOCH


@pytest.fixture
def admin():
    return make_address("admin")


@pytest.fixture
def alice():
    return make_address("alice")


@pytest.fixture
def bob():
    return make_address("bob")


@pytest.fixture
def charlie():
    return make_address("charlie")


@pytest.fixture
def dave():
    return make_address("dave")


@pytest.fixture
def outsider():
    return make_address("outsider")


@pytest.fixture
def fee_collector():
    return make_address("fee_collector")


@pytest.fixture
def deploy(direct_vm, direct_deploy, admin, fee_collector):
    """Deploy Tontine with admin as deployer and a distinct fee collector."""

    def _deploy(deployer=None, collector=None):
        direct_vm.warp(BASE_ISO)
        direct_vm.sender = deployer if deployer is not None else admin
        direct_vm.value = 0
        contract = direct_deploy(CONTRACT, collector if collector is not None else fee_collector)
        _patch_inmem_allocate()
        return contract

    return _deploy


def contract_module():
    """Return the loaded contract module so tests can read module constants."""
    import sys

    return sys.modules["_contract_tontine"]


def pool_kwargs(creator, whitelist=None, **overrides):
    """Build a set of valid create_pool arguments, applying any overrides."""
    if whitelist is None:
        whitelist = [creator, make_address("wl_a"), make_address("wl_b")]
    args = {
        "terms": "Which team wins the final?",
        "outcome_labels": ["home", "away"],
        "resolution_sources": ["https://ex.com/a", "https://ex.com/b"],
        "whitelist": whitelist,
        "join_deadline_offset": HOUR,
        "resolution_deadline_offset": 2 * HOUR,
        "creator_outcome_index": 0,
    }
    args.update(overrides)
    return args


def create_pool(contract, vm, creator, value=None, **overrides):
    """Create a pool as `creator` and return its integer id.

    The creator's stake is derived from value minus the creation fee, so the
    default value funds exactly the minimum stake plus the fee. Pass an explicit
    value to set a larger stake.
    """
    args = pool_kwargs(creator, **overrides)
    vm.sender = creator
    vm.value = value if value is not None else MIN_STAKE + CREATION_FEE
    pid = contract.create_pool(
        args["terms"],
        args["outcome_labels"],
        args["resolution_sources"],
        args["whitelist"],
        args["join_deadline_offset"],
        args["resolution_deadline_offset"],
        args["creator_outcome_index"],
    )
    return int(pid)


def join(contract, vm, wallet, pid, outcome_index, value):
    vm.sender = wallet
    vm.value = value
    contract.join_pool(pid, outcome_index)


def increase(contract, vm, wallet, pid, value):
    vm.sender = wallet
    vm.value = value
    contract.increase_stake(pid)


def mock_resolution(vm, outcome_index, confidence=90, evidence="settled by source"):
    """Register web and LLM mocks that drive request_resolution to a verdict."""
    vm.mock_web(r"https://ex\.com/.*", {"status": 200, "body": "result page"})
    vm.mock_llm(
        r"impartial resolver",
        json.dumps(
            {
                "outcome_index": outcome_index,
                "confidence": confidence,
                "evidence": evidence,
            }
        ),
    )
