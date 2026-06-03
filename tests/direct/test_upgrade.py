"""End to end code upgrade: propose, apply after the timelock, swap the code.

apply_code_upgrade rewrites the bytecode stored in the Root code slot. In
direct mode the already instantiated Python object keeps its old class, so the
new behaviour is verified by reading the swapped code back out of storage and
loading it as a fresh module to confirm the new method is present.
"""

import importlib.util
import os
import tempfile
from pathlib import Path

from conftest import BASE_EPOCH, to_iso

UPGRADE_TIMELOCK = 172800

NEW_METHOD = (
    "\n"
    "    @gl.public.view\n"
    "    def upgrade_marker(self) -> u256:\n"
    "        return u256(42)\n"
)


def _load_class_from_source(source: bytes, module_name: str):
    # The SDK allows only one gl.Contract subclass per process, so reset its
    # registry before loading a standalone copy for inspection.
    import genlayer.gl.genvm_contracts as genvm_contracts

    setattr(genvm_contracts, "__known_contract__", None)

    fd, path = tempfile.mkstemp(suffix=".py")
    os.write(fd, source)
    os.close(fd)
    try:
        spec = importlib.util.spec_from_file_location(module_name, path)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        return getattr(module, "Tontine")
    finally:
        os.unlink(path)


def test_code_upgrade_swaps_running_code(direct_vm, deploy, admin):
    contract = deploy()

    original_source = Path("contracts/tontine.py").read_bytes()
    new_source = original_source + NEW_METHOD.encode("utf-8")

    direct_vm.sender = admin
    contract.propose_code_upgrade(new_source, "add upgrade_marker view")
    direct_vm.warp(to_iso(BASE_EPOCH + UPGRADE_TIMELOCK + 1))
    contract.apply_code_upgrade()

    # The Root code slot now holds the proposed bytecode verbatim.
    import genlayer.gl as gl

    stored = bytes(gl.storage.Root.get().code.get())
    assert stored == new_source

    # The pending slot is cleared once applied.
    info = contract.get_pending_upgrade_info()
    assert info.has_pending is False

    # The swapped code defines the new method, which the original did not.
    upgraded_cls = _load_class_from_source(stored, "tontine_upgraded")
    assert hasattr(upgraded_cls, "upgrade_marker")

    original_cls = _load_class_from_source(original_source, "tontine_original")
    assert not hasattr(original_cls, "upgrade_marker")
