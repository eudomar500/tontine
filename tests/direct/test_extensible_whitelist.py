"""Extensible whitelist: open duels and creator approved entrants.

The whitelist is pure access control and is decoupled from all money math, so
these tests assert two things in tandem: that the new growth paths are guarded
exactly like join_pool, and that growing the whitelist never moves a total, a
count, or a payout. The MAX_WHITELIST cap lives in the shared _add_to_whitelist
helper, so the cap test on add_to_whitelist also covers the take_open_slot path.
"""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    mock_resolution,
    make_address,
    to_iso,
)

OPEN = 0
RESOLVING = 1
SETTLED = 2
REFUNDED = 3

MAX_WHITELIST = 100


def _open_duel(contract, direct_vm, creator):
    """Create an open duel with only the creator listed, on outcome 0."""
    return create_pool(
        contract,
        direct_vm,
        creator,
        whitelist=[creator],
        outcome_labels=["home", "away"],
        creator_outcome_index=0,
        is_open_duel=True,
    )


def _take_slot(contract, direct_vm, wallet, pid, outcome_index, value):
    direct_vm.sender = wallet
    direct_vm.value = value
    contract.take_open_slot(pid, outcome_index)


# Creation

def test_open_duel_creates_with_single_whitelist(direct_vm, deploy, alice):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    pool = contract.get_pool(pid)
    assert pool.is_open_duel
    assert [a for a in pool.whitelist] == [alice]
    # The summary the explorer renders cards from must carry the marker too.
    assert contract.get_pool_summary(pid).is_open_duel


def test_normal_pool_single_whitelist_still_rejected(direct_vm, deploy, alice):
    contract = deploy()
    # is_open_duel defaults to False, so the two party floor still applies.
    with direct_vm.expect_revert("whitelist size out of range"):
        create_pool(contract, direct_vm, alice, whitelist=[alice])


# take_open_slot

def test_take_open_slot_happy(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    assert contract.verify_in_whitelist(pid, bob)
    assert int(contract.get_stake(pid, bob).amount) == MIN_STAKE
    assert int(pool.outcomes[1].total_staked) == MIN_STAKE
    assert int(pool.outcomes[1].participants_count) == 1
    # total_pool is the creator stake plus the challenger stake, nothing else.
    assert int(pool.total_pool) == 2 * MIN_STAKE


def test_take_open_slot_not_open_duel(direct_vm, deploy, alice, bob):
    contract = deploy()
    # A normal pool created with bob already whitelisted; bob may join, but the
    # open slot path must refuse a pool that is not an open duel.
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    with direct_vm.expect_revert("not an open duel"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_take_open_slot_side_already_taken(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    # The side bob filled is now occupied.
    with direct_vm.expect_revert("slot already taken"):
        _take_slot(contract, direct_vm, charlie, pid, 1, MIN_STAKE)
    # The creator side has been occupied since creation.
    with direct_vm.expect_revert("slot already taken"):
        _take_slot(contract, direct_vm, charlie, pid, 0, MIN_STAKE)


def test_take_open_slot_after_deadline(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))
    with direct_vm.expect_revert("join deadline passed"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_take_open_slot_below_min_stake(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    with direct_vm.expect_revert("stake below minimum"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE - 1)


def test_take_open_slot_paused(direct_vm, deploy, admin, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    direct_vm.sender = admin
    contract.set_pause(True)
    with direct_vm.expect_revert("contract paused"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_take_open_slot_killswitch(direct_vm, deploy, admin, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    direct_vm.sender = admin
    contract.activate_killswitch()
    # activate_killswitch also sets paused, and the pause guard runs first, so
    # the surfaced message is "contract paused". The open slot path is blocked
    # under the killswitch either way, which is the property under test.
    with direct_vm.expect_revert("contract paused"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_take_open_slot_wrong_state(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    # Creator is the sole participant, so cancel takes the pool to REFUNDED.
    direct_vm.sender = alice
    contract.cancel_pool(pid)
    with direct_vm.expect_revert("pool not open"):
        _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_take_open_slot_race_one_winner(direct_vm, deploy, alice, bob, charlie):
    """Two wallets contend for the same slot; exactly one wins, cleanly.

    Direct mode applies calls in sequence, which models the serialized order a
    block produces. The first taker flips occupancy non-zero; the second reverts
    on the occupancy guard with no partial state and no captured funds.
    """
    contract = deploy()
    pid = _open_duel(contract, direct_vm, alice)

    _take_slot(contract, direct_vm, bob, pid, 1, MIN_STAKE)
    with direct_vm.expect_revert("slot already taken"):
        _take_slot(contract, direct_vm, charlie, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    # The loser left no trace: no stake, no whitelist entry, no effect on totals.
    assert not contract.verify_in_whitelist(pid, charlie)
    with direct_vm.expect_revert("no stake"):
        contract.get_stake(pid, charlie)
    assert int(pool.outcomes[1].participants_count) == 1
    assert int(pool.outcomes[1].total_staked) == MIN_STAKE
    assert int(pool.total_pool) == 2 * MIN_STAKE


# add_to_whitelist

def test_add_to_whitelist_happy(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )

    direct_vm.sender = alice
    contract.add_to_whitelist(pid, charlie)
    assert contract.verify_in_whitelist(pid, charlie)

    # The approved wallet joins through the unchanged join_pool path.
    join(contract, direct_vm, charlie, pid, 1, MIN_STAKE)
    assert int(contract.get_stake(pid, charlie).amount) == MIN_STAKE


def test_add_to_whitelist_non_creator(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )

    direct_vm.sender = bob
    with direct_vm.expect_revert("only creator"):
        contract.add_to_whitelist(pid, charlie)


def test_add_to_whitelist_resolving_rejected(direct_vm, deploy, alice, bob, charlie):
    from genlayer.py.types import u8, u256

    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    # RESOLVING is transient inside request_resolution, so set it in storage to
    # exercise the state guard directly.
    inst = contract._instance
    pool = inst.pools_by_id.get(u256(pid), None)
    pool.state = u8(RESOLVING)

    direct_vm.sender = alice
    with direct_vm.expect_revert("pool not open"):
        contract.add_to_whitelist(pid, charlie)


def test_add_to_whitelist_settled_rejected(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)
    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    direct_vm.sender = alice
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == SETTLED

    direct_vm.sender = alice
    with direct_vm.expect_revert("pool not open"):
        contract.add_to_whitelist(pid, charlie)


def test_add_to_whitelist_refunded_rejected(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    # Creator is the sole participant, so cancel takes the pool to REFUNDED.
    direct_vm.sender = alice
    contract.cancel_pool(pid)
    assert int(contract.get_pool(pid).state) == REFUNDED

    direct_vm.sender = alice
    with direct_vm.expect_revert("pool not open"):
        contract.add_to_whitelist(pid, charlie)


def test_add_to_whitelist_after_deadline(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))

    direct_vm.sender = alice
    with direct_vm.expect_revert("join deadline passed"):
        contract.add_to_whitelist(pid, charlie)


def test_add_to_whitelist_duplicate(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )

    direct_vm.sender = alice
    with direct_vm.expect_revert("already in whitelist"):
        contract.add_to_whitelist(pid, bob)


def test_add_to_whitelist_cap_enforced(direct_vm, deploy, alice):
    contract = deploy()
    # Fill the whitelist to exactly MAX_WHITELIST at creation: creator plus 99.
    others = [make_address("cap_%d" % i) for i in range(MAX_WHITELIST - 1)]
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=[alice] + others,
        creator_outcome_index=0,
    )

    direct_vm.sender = alice
    with direct_vm.expect_revert("whitelist full"):
        contract.add_to_whitelist(pid, make_address("one_too_many"))


# Invariants

def test_whitelist_growth_does_not_change_accounting(direct_vm, deploy, alice, bob, charlie):
    """Adding a non staking wallet moves no total, count, or stake."""
    contract = deploy()
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, bob], creator_outcome_index=0
    )
    join(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    before = contract.get_pool(pid)
    total_pool_before = int(before.total_pool)
    o0_before = (int(before.outcomes[0].total_staked), int(before.outcomes[0].participants_count))
    o1_before = (int(before.outcomes[1].total_staked), int(before.outcomes[1].participants_count))

    direct_vm.sender = alice
    contract.add_to_whitelist(pid, charlie)

    after = contract.get_pool(pid)
    assert int(after.total_pool) == total_pool_before
    assert (int(after.outcomes[0].total_staked), int(after.outcomes[0].participants_count)) == o0_before
    assert (int(after.outcomes[1].total_staked), int(after.outcomes[1].participants_count)) == o1_before
    # The added wallet holds no stake until it joins on its own.
    with direct_vm.expect_revert("no stake"):
        contract.get_stake(pid, charlie)
