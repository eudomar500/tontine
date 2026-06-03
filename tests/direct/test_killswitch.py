"""Killswitch behaviour: emergency only payout, and dead-man activation."""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    mock_resolution,
    contract_module,
    to_iso,
)

REFUNDED = 3
SETTLED = 2
EMERGENCY = 4


def test_killswitch_blocks_claims_only_emergency_pays(
    direct_vm, deploy, admin, alice, bob, charlie
):
    """With the killswitch armed, claim_winnings and claim_refund revert and the
    only sanctioned exit is emergency_withdraw, which returns each stake."""
    contract = deploy()

    # Pool A: settle it so there is a winning claim to block.
    settled = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    join(contract, direct_vm, bob, settled, 1, MIN_STAKE)

    # Pool B: a refunded pool to block a refund claim against. Cancelled while the
    # creator is the only participant.
    refunded = create_pool(contract, direct_vm, charlie, whitelist=[charlie, alice])
    direct_vm.sender = charlie
    contract.cancel_pool(refunded)
    assert int(contract.get_pool(refunded).state) == REFUNDED

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    direct_vm.sender = alice
    contract.request_resolution(settled)
    assert int(contract.get_pool(settled).state) == SETTLED

    # Admin arms the killswitch.
    direct_vm.sender = admin
    contract.activate_killswitch()

    direct_vm.sender = alice
    with direct_vm.expect_revert("killswitch active"):
        contract.claim_winnings(settled)

    direct_vm.sender = charlie
    with direct_vm.expect_revert("killswitch active"):
        contract.claim_refund(refunded)

    # emergency_withdraw is the one path that still pays out.
    direct_vm.sender = alice
    contract.emergency_withdraw(settled)
    assert bool(contract.get_stake(settled, alice).claimed) is True
    assert int(contract.get_pool(settled).state) == EMERGENCY


def test_deadman_activation_by_non_admin(direct_vm, deploy, outsider):
    """A non-admin can arm the killswitch only after the dead-man period."""
    contract = deploy()
    deadman_period = int(contract_module().DEADMAN_PERIOD)

    direct_vm.sender = outsider
    with direct_vm.expect_revert("only admin or dead-man triggered"):
        contract.activate_killswitch()

    # Move past the last admin heartbeat plus the dead-man period.
    direct_vm.warp(to_iso(BASE_EPOCH + deadman_period + 1))
    direct_vm.sender = outsider
    contract.activate_killswitch()

    assert bool(contract.get_admin_state().killswitch_active) is True
