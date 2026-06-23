"""Open pool: a general N-outcome pool any wallet may join while OPEN.

join_open_pool replaces join_pool's whitelist gate with an is_open check and
auto-whitelists each joiner as it stakes, so the MAX_WHITELIST cap doubles as a
hard participant cap of 100. Joiners hold ordinary stakes, so resolution,
payout, refund, and claim behave exactly as for a normal multi-participant pool.
"""

from conftest import (
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    mock_resolution,
    make_address,
    to_iso,
)

SETTLED = 2

MAX_WHITELIST = 100


def _open_pool(contract, direct_vm, creator):
    """Create an open pool with only the creator listed, on outcome 0."""
    return create_pool(
        contract,
        direct_vm,
        creator,
        whitelist=[creator],
        outcome_labels=["home", "away"],
        creator_outcome_index=0,
        is_open=True,
    )


def _join_open(contract, direct_vm, wallet, pid, outcome_index, value):
    direct_vm.sender = wallet
    direct_vm.value = value
    contract.join_open_pool(pid, outcome_index)


# Creation

def test_open_pool_creates_with_single_whitelist(direct_vm, deploy, alice):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    pool = contract.get_pool(pid)
    assert pool.is_open
    assert [a for a in pool.whitelist] == [alice]
    # The explorer renders cards from the summary, so the marker must be there.
    assert contract.get_pool_summary(pid).is_open


def test_open_and_duel_both_true_rejected(direct_vm, deploy, alice):
    contract = deploy()
    with direct_vm.expect_revert("conflicting pool type"):
        create_pool(
            contract,
            direct_vm,
            alice,
            whitelist=[alice],
            outcome_labels=["home", "away"],
            creator_outcome_index=0,
            is_open=True,
            is_open_duel=True,
        )


def test_normal_pool_single_whitelist_still_rejected(direct_vm, deploy, alice):
    contract = deploy()
    # Both flags default false, so the two party floor still applies.
    with direct_vm.expect_revert("whitelist size out of range"):
        create_pool(contract, direct_vm, alice, whitelist=[alice])


# join_open_pool happy paths

def test_join_open_pool_whitelists_and_stakes(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    assert contract.verify_in_whitelist(pid, bob)
    stake = contract.get_stake(pid, bob)
    # Ordinary stake record, identical to a normal joiner.
    assert int(stake.amount) == MIN_STAKE
    assert int(stake.outcome_index) == 1
    assert stake.claimed is False
    assert int(pool.outcomes[1].total_staked) == MIN_STAKE
    assert int(pool.outcomes[1].participants_count) == 1
    assert int(pool.total_pool) == 2 * MIN_STAKE


def test_join_open_pool_many_per_outcome(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    # Many wallets on the same outcome, unlike a duel single slot.
    _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)
    _join_open(contract, direct_vm, charlie, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    assert int(pool.outcomes[1].participants_count) == 2
    assert int(pool.outcomes[1].total_staked) == 2 * MIN_STAKE


def test_join_open_pool_different_outcomes(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    _join_open(contract, direct_vm, bob, pid, 0, MIN_STAKE)
    _join_open(contract, direct_vm, charlie, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    # Creator plus bob on outcome 0, charlie on outcome 1.
    assert int(pool.outcomes[0].participants_count) == 2
    assert int(pool.outcomes[1].participants_count) == 1
    assert int(pool.total_pool) == 3 * MIN_STAKE


# join_open_pool reverts

def test_join_open_pool_not_open(direct_vm, deploy, alice, charlie):
    contract = deploy()
    # A normal pool is not open to all.
    pid = create_pool(
        contract, direct_vm, alice, whitelist=[alice, charlie], creator_outcome_index=0
    )
    with direct_vm.expect_revert("pool not open to all"):
        _join_open(contract, direct_vm, charlie, pid, 1, MIN_STAKE)


def test_join_open_pool_wrong_state(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    # Creator is the sole participant, so cancel takes the pool to REFUNDED.
    direct_vm.sender = alice
    contract.cancel_pool(pid)
    with direct_vm.expect_revert("pool not open"):
        _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_join_open_pool_after_deadline(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    direct_vm.warp(to_iso(BASE_EPOCH + HOUR + 1))
    with direct_vm.expect_revert("join deadline passed"):
        _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_join_open_pool_below_min_stake(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    with direct_vm.expect_revert("stake below minimum"):
        _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE - 1)


def test_join_open_pool_paused(direct_vm, deploy, admin, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    direct_vm.sender = admin
    contract.set_pause(True)
    with direct_vm.expect_revert("contract paused"):
        _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_join_open_pool_killswitch(direct_vm, deploy, admin, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    direct_vm.sender = admin
    contract.activate_killswitch()
    # activate_killswitch also sets paused, and the pause guard runs first, so
    # the surfaced message is "contract paused". The open join path is blocked
    # under the killswitch either way, which is the property under test.
    with direct_vm.expect_revert("contract paused"):
        _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)


def test_join_open_pool_already_participating(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)
    with direct_vm.expect_revert("already participating"):
        _join_open(contract, direct_vm, bob, pid, 0, MIN_STAKE)


def test_join_open_pool_invalid_outcome(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    with direct_vm.expect_revert("invalid outcome"):
        _join_open(contract, direct_vm, bob, pid, 2, MIN_STAKE)


# Cap

def test_join_open_pool_caps_at_max_whitelist(direct_vm, deploy, alice):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)

    # Creator occupies one whitelist slot, so 99 joiners fill it to 100.
    for i in range(MAX_WHITELIST - 1):
        _join_open(contract, direct_vm, make_address("open_%d" % i), pid, 1, MIN_STAKE)

    # The 101st participant exceeds the cap and is rejected.
    with direct_vm.expect_revert("whitelist full"):
        _join_open(contract, direct_vm, make_address("one_too_many"), pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    total_participants = sum(int(o.participants_count) for o in pool.outcomes)
    assert total_participants == MAX_WHITELIST


# Resolution comes free

def test_open_pool_joiner_can_request_resolution(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)
    # bob joins outcome 1, giving two funded outcomes and whitelisting bob.
    _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    # bob joined via the open path, so bob is whitelisted and may resolve.
    direct_vm.sender = bob
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == SETTLED


# Full lifecycle

def test_open_pool_full_lifecycle(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)
    # alice on outcome 0 at creation; bob joins 0, charlie joins 1.
    _join_open(contract, direct_vm, bob, pid, 0, MIN_STAKE)
    _join_open(contract, direct_vm, charlie, pid, 1, MIN_STAKE)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    direct_vm.sender = alice
    contract.request_resolution(pid)
    assert int(contract.get_pool(pid).state) == SETTLED
    assert int(contract.get_pool(pid).winning_outcome_index) == 0

    # Winners claim, the loser cannot, exactly as a normal pool.
    direct_vm.sender = alice
    contract.claim_winnings(pid)
    direct_vm.sender = bob
    contract.claim_winnings(pid)
    direct_vm.sender = charlie
    with direct_vm.expect_revert("no winning stake"):
        contract.claim_winnings(pid)


# Invariant: the flag feeds nothing but the join gate

def test_open_flag_does_not_change_accounting(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = _open_pool(contract, direct_vm, alice)
    _join_open(contract, direct_vm, bob, pid, 1, MIN_STAKE)

    pool = contract.get_pool(pid)
    # Totals are exactly creator stake plus bob stake, driven only by stakes.
    assert int(pool.total_pool) == 2 * MIN_STAKE
    assert int(pool.outcomes[0].total_staked) == MIN_STAKE
    assert int(pool.outcomes[0].participants_count) == 1
    assert int(pool.outcomes[1].total_staked) == MIN_STAKE
    assert int(pool.outcomes[1].participants_count) == 1
