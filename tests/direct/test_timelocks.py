"""Timelocked admin operations: blocked before the deadline, allowed after.

Admin transfer is the exception: it is a claim window rather than a delay, so
the pending admin must accept before expiry and is locked out afterwards.
"""

from conftest import (
    BASE_EPOCH,
    make_address,
    to_iso,
)

UPGRADE_TIMELOCK = 172800
ADMIN_TRANSFER_WINDOW = 604800


def test_creation_fee_change_timelock(direct_vm, deploy, admin):
    contract = deploy()
    new_fee = 2 * 10 ** 18

    direct_vm.sender = admin
    contract.propose_creation_fee_change(new_fee)

    with direct_vm.expect_revert("timelock not elapsed"):
        contract.apply_creation_fee_change()

    direct_vm.warp(to_iso(BASE_EPOCH + UPGRADE_TIMELOCK + 1))
    contract.apply_creation_fee_change()
    assert int(contract.get_creation_fee()) == new_fee


def test_fee_collector_change_timelock(direct_vm, deploy, admin):
    contract = deploy()
    new_collector = make_address("new_collector")

    direct_vm.sender = admin
    contract.propose_fee_collector_change(new_collector)

    with direct_vm.expect_revert("timelock not elapsed"):
        contract.apply_fee_collector_change()

    direct_vm.warp(to_iso(BASE_EPOCH + UPGRADE_TIMELOCK + 1))
    contract.apply_fee_collector_change()
    assert contract.get_admin_state().fee_collector == new_collector


def test_code_upgrade_timelock(direct_vm, deploy, admin):
    contract = deploy()

    direct_vm.sender = admin
    contract.propose_code_upgrade(b"# replacement\n", "bump")

    with direct_vm.expect_revert("timelock not elapsed"):
        contract.apply_code_upgrade()

    direct_vm.warp(to_iso(BASE_EPOCH + UPGRADE_TIMELOCK + 1))
    contract.apply_code_upgrade()
    assert contract.get_pending_upgrade_info().has_pending is False


def test_admin_transfer_window(direct_vm, deploy, admin):
    """Acceptance is allowed inside the window and rejected once it expires."""
    new_admin = make_address("new_admin")

    contract = deploy()
    direct_vm.sender = admin
    contract.propose_admin_transfer(new_admin)

    # Accepting within the window transfers control.
    direct_vm.sender = new_admin
    contract.accept_admin_transfer()
    assert contract.get_admin_state().admin == new_admin


def test_admin_transfer_expired(direct_vm, deploy, admin):
    new_admin = make_address("late_admin")

    contract = deploy()
    direct_vm.sender = admin
    contract.propose_admin_transfer(new_admin)

    direct_vm.warp(to_iso(BASE_EPOCH + ADMIN_TRANSFER_WINDOW + 1))
    direct_vm.sender = new_admin
    with direct_vm.expect_revert("admin transfer expired"):
        contract.accept_admin_transfer()
