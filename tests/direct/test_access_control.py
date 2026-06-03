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
