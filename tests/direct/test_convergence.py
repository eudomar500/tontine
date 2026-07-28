"""Convergence enforcement in request_resolution.

The audited guarantee is that resolution requires every declared source to load
and to converge on the same winning outcome index. This suite pins the behavior
that decides fund distribution:

- Every declared source must load. A missing or empty source leaves the pool
  pending and retryable, never a single-source settle.
- Each source must yield a determinate outcome. A source the model cannot
  resolve is treated as a failed source, so the pool stays pending.
- Sources that load and disagree route to refund; no arbitrary winner is picked.
- Only agreement above the confidence threshold settles.

Convergence is plain integer equality on the resolved outcome index, so the same
inputs always produce the same on-chain result and validators cannot diverge.
"""

import json

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    to_iso,
)

OPEN = 0
SETTLED = 2
REFUNDED = 3
REASON_INCONCLUSIVE = 6


def _contested(contract, direct_vm, alice, bob):
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
    return pid


def _mock_source_a(direct_vm, body="home won the match"):
    direct_vm.mock_web(r"https://ex\.com/a", {"status": 200, "body": body})


def _mock_source_b(direct_vm, body="home won the match"):
    direct_vm.mock_web(r"https://ex\.com/b", {"status": 200, "body": body})


def _mock_per_source(direct_vm, per_source, confidence=90, evidence="per source"):
    direct_vm.mock_llm(
        r"impartial resolver",
        json.dumps(
            {
                "reasoning": "per source",
                "per_source": per_source,
                "confidence": confidence,
                "evidence": evidence,
            }
        ),
    )


def test_both_sources_converge_settles(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm)
    _mock_per_source(direct_vm, [0, 0])
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == SETTLED
    assert int(pool.winning_outcome_index) == 0


def test_one_source_fails_stays_pending(direct_vm, deploy, alice, bob):
    """Source b cannot load, so the pool must not settle on source a alone."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    # a returns content; b is left unmocked so its render raises and it does not
    # load. The LLM is never reached because a required source is missing.
    _mock_source_a(direct_vm)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    # Pending is represented as OPEN so the resolution can be retried later.
    assert int(pool.state) == OPEN
    assert int(pool.winning_outcome_index) == 255


def test_one_source_empty_stays_pending(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm, body="")
    direct_vm.sender = alice
    contract.request_resolution(pid)

    assert int(contract.get_pool(pid).state) == OPEN


def test_all_sources_fail_stays_pending(direct_vm, deploy, alice, bob):
    """Both sources unreachable leaves the pool pending, not refunded."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    direct_vm.sender = alice
    contract.request_resolution(pid)

    assert int(contract.get_pool(pid).state) == OPEN


def test_sources_diverge_refunds(direct_vm, deploy, alice, bob):
    """Sources load but point to different outcomes, so the pool refunds."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    _mock_source_a(direct_vm, body="home won")
    _mock_source_b(direct_vm, body="away won")
    _mock_per_source(direct_vm, [0, 1])
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE
    # No arbitrary winner is recorded.
    assert int(pool.winning_outcome_index) == 255


def test_indeterminate_source_stays_pending(direct_vm, deploy, alice, bob):
    """A source that loads but yields no outcome is a failed source: pending."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm)
    _mock_per_source(direct_vm, [0, -1])
    direct_vm.sender = alice
    contract.request_resolution(pid)

    assert int(contract.get_pool(pid).state) == OPEN


def test_out_of_range_source_stays_pending(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm)
    _mock_per_source(direct_vm, [0, 99])
    direct_vm.sender = alice
    contract.request_resolution(pid)

    assert int(contract.get_pool(pid).state) == OPEN


def test_pending_is_retryable(direct_vm, deploy, alice, bob):
    """A pool left pending can be resolved on a later attempt once sources load."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    # First attempt: source b is missing, so the pool stays pending.
    _mock_source_a(direct_vm)
    direct_vm.sender = alice
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == OPEN

    # Second attempt: both sources load and converge, so it settles.
    _mock_source_b(direct_vm)
    _mock_per_source(direct_vm, [0, 0])
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == SETTLED
    assert int(pool.winning_outcome_index) == 0


def _open_contested_pool(contract, direct_vm, alice, bob):
    """Create a two-sided contest without warping, so several can share a clock."""
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice, bob],
        outcome_labels=["home", "away"],
        creator_outcome_index=0,
    )
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)
    return pid


def test_convergence_deterministic_on_agreement(direct_vm, deploy, alice, bob):
    """Identical converging inputs always settle two identical pools the same way.

    Convergence is integer equality on the resolved index with no second model
    call, so the mapping from inputs to result is deterministic and validators
    re-running it cannot diverge.
    """
    contract = deploy()
    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm)

    # Both pools are created before the clock advances, so one warp puts both
    # past the resolution deadline and both see the same single LLM mock.
    pid_a = _open_contested_pool(contract, direct_vm, alice, bob)
    pid_b = _open_contested_pool(contract, direct_vm, alice, bob)
    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    _mock_per_source(direct_vm, [1, 1])

    direct_vm.sender = alice
    contract.request_resolution(pid_a)
    contract.request_resolution(pid_b)
    pool_a = contract.get_pool(pid_a)
    pool_b = contract.get_pool(pid_b)

    assert int(pool_a.state) == SETTLED
    assert int(pool_b.state) == SETTLED
    assert int(pool_a.winning_outcome_index) == int(pool_b.winning_outcome_index) == 1


def test_convergence_deterministic_on_divergence(direct_vm, deploy, alice, bob):
    """Identical diverging inputs always refund two identical pools the same way."""
    contract = deploy()
    _mock_source_a(direct_vm)
    _mock_source_b(direct_vm)

    pid_a = _open_contested_pool(contract, direct_vm, alice, bob)
    pid_b = _open_contested_pool(contract, direct_vm, alice, bob)
    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    _mock_per_source(direct_vm, [0, 1])

    direct_vm.sender = alice
    contract.request_resolution(pid_a)
    contract.request_resolution(pid_b)
    pool_a = contract.get_pool(pid_a)
    pool_b = contract.get_pool(pid_b)

    assert int(pool_a.state) == REFUNDED
    assert int(pool_b.state) == REFUNDED
    assert int(pool_a.refund_reason) == int(pool_b.refund_reason) == REASON_INCONCLUSIVE
