"""Deadline enforcement that blocks late entries and early resolution."""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    to_iso,
)


def test_join_after_deadline_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])

    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))
    direct_vm.sender = bob
    direct_vm.value = MIN_STAKE
    with direct_vm.expect_revert("join deadline passed"):
        contract.join_pool(pid, 1)


def test_increase_after_deadline_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])

    # bob takes a position while the pool is still open.
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))
    direct_vm.sender = bob
    direct_vm.value = MIN_STAKE
    with direct_vm.expect_revert("join deadline passed"):
        contract.increase_stake(pid)


def test_request_resolution_before_deadline_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    # Past the join deadline but before the resolution deadline.
    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))
    direct_vm.sender = alice
    with direct_vm.expect_revert("resolution deadline not reached"):
        contract.request_resolution(pid)
