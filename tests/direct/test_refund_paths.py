"""Resolution outcomes that send a pool to REFUNDED rather than SETTLED."""

import json

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
REFUNDED = 3
REASON_NOBODY_WON = 3
REASON_NO_REAL_CONTEST = 4
REASON_INCONCLUSIVE = 6


def _contested(contract, direct_vm, alice, bob):
    """Open a real contest and advance past the resolution deadline.

    Creator backs outcome 0 and a second wallet backs outcome 1, so two outcomes
    are funded and the resolver path runs rather than the NO_REAL_CONTEST short
    circuit.
    """
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


def test_partial_sources_resolve(direct_vm, deploy, alice, bob):
    """An empty source is skipped and the resolution proceeds from the rest.

    One source renders no text and the other returns usable content. The empty
    one is dropped instead of failing the whole resolution, and the verdict drawn
    from the remaining source settles the pool.
    """
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    direct_vm.mock_web(r"https://ex\.com/a", {"status": 200, "body": ""})
    direct_vm.mock_web(r"https://ex\.com/b", {"status": 200, "body": "home won the match"})
    direct_vm.mock_llm(
        r"impartial resolver",
        json.dumps({"outcome_index": 0, "confidence": 90, "evidence": "home won"}),
    )
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == SETTLED
    assert int(pool.winning_outcome_index) == 0


def test_zero_usable_sources_refund(direct_vm, deploy, alice, bob):
    """When every source renders empty, the pool refunds as inconclusive.

    No LLM mock is registered: with no usable content decide() reports -1 without
    prompting the model, so the resolution refunds instead of reverting.
    """
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    direct_vm.mock_web(r"https://ex\.com/a", {"status": 200, "body": ""})
    direct_vm.mock_web(r"https://ex\.com/b", {"status": 200, "body": ""})
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE


def test_inconclusive_verdict_refunds(direct_vm, deploy, alice, bob):
    """A -1 verdict from the resolver refunds as inconclusive instead of reverting."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    mock_resolution(direct_vm, outcome_index=-1)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE


def test_low_confidence_refunds(direct_vm, deploy, alice, bob):
    """A verdict below the confidence threshold refunds as inconclusive."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    mock_resolution(direct_vm, outcome_index=0, confidence=50)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE


def test_out_of_range_index_refunds(direct_vm, deploy, alice, bob):
    """An out-of-range index from the resolver refunds as inconclusive."""
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    mock_resolution(direct_vm, outcome_index=99)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE


def test_raising_source_skipped_resolves(direct_vm, deploy, alice, bob):
    """A source whose render raises is skipped, and a good source still settles.

    In direct mode an unmocked URL makes web.render raise, which stands in for a
    walled page that throws inside the headless render. The first source raises
    and is dropped; the second returns content and drives the verdict.
    """
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    # /a is left unmocked so its render raises; /b returns usable content.
    direct_vm.mock_web(r"https://ex\.com/b", {"status": 200, "body": "home won the match"})
    direct_vm.mock_llm(
        r"impartial resolver",
        json.dumps({"outcome_index": 0, "confidence": 90, "evidence": "home won"}),
    )
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == SETTLED
    assert int(pool.winning_outcome_index) == 0


def test_all_sources_raise_refund(direct_vm, deploy, alice, bob):
    """When every source render raises, the pool refunds as inconclusive.

    Both URLs are unmocked so both renders raise. With no usable content decide()
    reports -1 without prompting the model, so the resolution refunds rather than
    finalizing with an execution error.
    """
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == REFUNDED
    assert int(pool.refund_reason) == REASON_INCONCLUSIVE


def test_good_source_with_one_raising_resolves(direct_vm, deploy, alice, bob):
    """A good first source still settles when a later source raises.

    Order independence: the first source returns content and the second raises
    and is dropped, so the verdict comes from the first.
    """
    contract = deploy()
    pid = _contested(contract, direct_vm, alice, bob)

    # /a returns content; /b is left unmocked so its render raises.
    direct_vm.mock_web(r"https://ex\.com/a", {"status": 200, "body": "home won the match"})
    direct_vm.mock_llm(
        r"impartial resolver",
        json.dumps({"outcome_index": 0, "confidence": 90, "evidence": "home won"}),
    )
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == SETTLED
    assert int(pool.winning_outcome_index) == 0
