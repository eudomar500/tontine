"""Who may resolve a pool and who may force a timeout refund."""

from conftest import (
    MIN_STAKE,
    HOUR,
    DAY,
    BASE_EPOCH,
    create_pool,
    join,
    to_iso,
)

OPEN = 0
REFUNDED = 3
REASON_TIMEOUT = 2


def test_force_refund_callable_by_anyone_after_timeout(direct_vm, deploy, alice, bob, outsider):
    """force_refund is the timeout backstop for a pool that never resolves.

    A pool stays OPEN whenever resolution does not complete, whether the
    whitelisted members go silent and never call request_resolution or a
    resolution attempt fails to converge across validators. Genuine
    eq_principle non-convergence cannot be caught inside the contract because it
    is disagreement across validators rather than a single execution; the
    protocol leaves such a transaction undetermined and commits none of its
    writes, so the pool is left OPEN either way. This test covers the silent
    whitelist case: once timeout_deadline passes, any caller can force the
    refund so funds are never stranded.
    """
    contract = deploy()
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])

    # timeout_deadline is resolution_deadline (2h) plus the 1 day buffer.
    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + DAY + 1))

    # outsider is not whitelisted, yet force_refund is open to anyone so funds
    # are never stranded if the members go quiet.
    direct_vm.sender = outsider
    contract.force_refund(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_TIMEOUT


def test_timeout_refund_returns_full_stakes_after_failed_resolution(direct_vm, deploy, alice, bob, outsider):
    """A pool stuck OPEN past timeout refunds every participant their full stake.

    This documents the recovery path for genuine eq_principle non-convergence.
    Validators disagreeing on a resolution cannot be caught inside the contract;
    the protocol marks that transaction undetermined and commits none of its
    writes, so the pool remains OPEN regardless of how many resolution attempts
    failed before. Once timeout_deadline passes, force_refund is open to anyone
    and each participant reclaims their stake, so no number of failed attempts
    can strand funds.

    Direct mode runs leader only and cannot manufacture cross-validator
    non-convergence, so the backstop is exercised at its post-condition: a pool
    still OPEN past timeout is fully refundable. Full-stake recovery is
    structural rather than asserted on balances, since the direct harness has no
    outgoing-transfer instrumentation: claim_refund transfers stake.amount with
    no proration and no fee, unlike claim_winnings, so the recorded stake and
    its single-use claimed flag are what the assertions check.
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
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    # Both sides hold their full minimum stake and nothing has been claimed yet.
    alice_stake = contract.get_stake(pid, alice)
    bob_stake = contract.get_stake(pid, bob)
    assert int(alice_stake.amount) == MIN_STAKE
    assert int(bob_stake.amount) == MIN_STAKE
    assert not alice_stake.claimed
    assert not bob_stake.claimed

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + DAY + 1))

    # The pool never resolved, so any caller can force the timeout refund.
    direct_vm.sender = outsider
    contract.force_refund(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_TIMEOUT

    # Each participant reclaims once; the claimed flag flips and blocks a repeat.
    direct_vm.sender = alice
    contract.claim_refund(pid)
    assert contract.get_stake(pid, alice).claimed
    with direct_vm.expect_revert("already claimed"):
        contract.claim_refund(pid)

    direct_vm.sender = bob
    contract.claim_refund(pid)
    assert contract.get_stake(pid, bob).claimed
    with direct_vm.expect_revert("already claimed"):
        contract.claim_refund(pid)


def test_request_resolution_restricted_to_whitelist(direct_vm, deploy, alice, bob, outsider):
    contract = deploy()
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice, bob],
        creator_outcome_index=0,
    )
    # bob joins the creator's outcome, leaving a single funded outcome so the
    # whitelisted call resolves without reaching the LLM.
    join(contract, direct_vm, bob, pid, 0, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))

    direct_vm.sender = outsider
    with direct_vm.expect_revert("not in whitelist"):
        contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == OPEN

    # A whitelisted member is allowed through.
    direct_vm.sender = alice
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == REFUNDED
