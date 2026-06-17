"""force_refund must also rescue a pool stuck in the transient RESOLVING state.

request_resolution sets RESOLVING and then overwrites it to a terminal state
within the same transaction, so RESOLVING never persists on any completed call
and cannot be reached through the public surface. To exercise the widened gate
we set the state directly in storage, modeling a resolution transaction that
committed nothing past the RESOLVING marker. The construction path is documented
inline so the test does not read as driving the contract through a real call.
"""

from conftest import (
    MIN_STAKE,
    HOUR,
    DAY,
    BASE_EPOCH,
    create_pool,
    join,
    to_iso,
)

RESOLVING = 1
REFUNDED = 3
REASON_TIMEOUT = 2


def test_force_refund_on_resolving_pool_after_timeout(direct_vm, deploy, alice, bob, outsider):
    """A pool stuck in RESOLVING past timeout refunds every participant in full.

    This is the defense in depth case for genuine eq_principle non-convergence.
    A non-convergent resolution leaves the pool OPEN today because the RESOLVING
    write is transient, but the gate no longer depends on that: even a pool
    observed in RESOLVING is refundable once timeout_deadline passes, so funds
    can never be stranded by a stuck resolution. Full-stake recovery is
    structural since claim_refund transfers stake.amount with no proration or
    fee, so the assertions check the recorded stake and the single-use claimed
    flag rather than balances, which the direct harness does not instrument.
    """
    from genlayer.py.types import u8, u256

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

    # Both sides hold their full minimum stake before any refund.
    assert int(contract.get_stake(pid, alice).amount) == MIN_STAKE
    assert int(contract.get_stake(pid, bob).amount) == MIN_STAKE

    # Place the pool in RESOLVING by writing storage directly on the live
    # instance, since no completed call leaves a pool in that state.
    inst = contract._instance
    pool = inst.pools_by_id.get(u256(pid), None)
    pool.state = u8(RESOLVING)
    assert int(contract.get_pool(pid).state) == RESOLVING

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + DAY + 1))

    # A stuck pool is refundable by anyone once the timeout passes.
    direct_vm.sender = outsider
    contract.force_refund(pid)

    pool_view = contract.get_pool(pid)
    assert int(pool_view.state) == REFUNDED
    assert int(pool_view.refund_reason) == REASON_TIMEOUT

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
