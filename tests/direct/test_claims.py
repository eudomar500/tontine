"""Claim guards on a settled pool: single claim, winners only."""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    mock_resolution,
    to_iso,
)

SETTLED = 2


def _settled_pool(direct_vm, contract, alice, bob):
    """Open a two sided pool and settle it with outcome 0 (alice) winning."""
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice, bob],
        outcome_labels=["home", "away"],
        creator_outcome_index=0,
    )
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    direct_vm.sender = alice
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == SETTLED
    return pid


def test_double_claim_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _settled_pool(direct_vm, contract, alice, bob)

    direct_vm.sender = alice
    contract.claim_winnings(pid)

    direct_vm.sender = alice
    with direct_vm.expect_revert("already claimed"):
        contract.claim_winnings(pid)


def test_losing_outcome_claim_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _settled_pool(direct_vm, contract, alice, bob)

    # bob backed the losing outcome and has nothing to claim.
    direct_vm.sender = bob
    with direct_vm.expect_revert("no winning stake"):
        contract.claim_winnings(pid)
