"""Resolution outcomes that send a pool to REFUNDED rather than SETTLED."""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    mock_resolution,
    to_iso,
)

REFUNDED = 3
REASON_NOBODY_WON = 3
REASON_NO_REAL_CONTEST = 4


def test_no_real_contest_refunds_without_llm(direct_vm, deploy, alice, bob):
    """A single funded outcome short circuits to REFUNDED before any nondet work.

    No web or LLM mocks are registered. If request_resolution tried to reach the
    resolver it would raise MockNotFoundError, so a clean REFUNDED result proves
    the LLM path was never entered.
    """
    contract = deploy()
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice, bob],
        outcome_labels=["home", "away"],
        creator_outcome_index=0,
    )
    # bob joins the same outcome as the creator, so only one outcome is funded.
    join(contract, direct_vm, bob, pid, 0, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_NO_REAL_CONTEST


def test_nobody_won_refunds(direct_vm, deploy, alice, bob):
    """A verdict for an unfunded outcome refunds everyone.

    Reaching this branch requires a real contest (two funded outcomes) and a
    resolver verdict, so the mocked LLM is exercised here by design; the empty
    winning outcome is only discovered after the verdict is read back.
    """
    contract = deploy()
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice, bob],
        outcome_labels=["home", "away", "draw"],
        creator_outcome_index=0,
    )
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    # The resolver picks "draw" (index 2), which nobody staked.
    mock_resolution(direct_vm, outcome_index=2)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_NOBODY_WON
