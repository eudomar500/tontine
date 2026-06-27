"""Accumulation and idempotency logic for the standalone leaderboard contract.

The leaderboard reads settled pools from Tontine through cross-contract views.
Direct mode does not route those reads to a deployed Tontine, so a fake Tontine
is served through the VM gl_call hook (see leaderboard_fake). The fake returns
the exact dict and list shapes a real cross-contract read decodes to, and raises
on a missing stake, so the contract code under test is identical to production.
The real cross-contract read and revert-catch are proven by the integration test.
"""

from conftest import make_address, zero_address, BASE_ISO
from leaderboard_fake import FakeTontine, make_hook

OPEN = 0
RESOLVING = 1
SETTLED = 2
REFUNDED = 3
EMERGENCY = 4


def _setup(direct_vm, direct_deploy):
    tontine_addr = make_address("tontine_v4")
    fake = FakeTontine()
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = make_address("deployer")
    direct_vm.value = 0
    contract = direct_deploy("contracts/TontineLeaderboard.py", tontine_addr)
    direct_vm._gl_call_hook = make_hook(tontine_addr, fake)
    return contract, fake


def test_constructor_rejects_zero(direct_vm, direct_deploy):
    direct_vm.warp(BASE_ISO)
    direct_vm.sender = make_address("deployer")
    direct_vm.value = 0
    with direct_vm.expect_revert("invalid tontine address"):
        direct_deploy("contracts/TontineLeaderboard.py", zero_address())


def test_get_tontine_address(direct_vm, direct_deploy):
    contract, _ = _setup(direct_vm, direct_deploy)
    assert contract.get_tontine_address() == make_address("tontine_v4")


def test_settled_pool_counts_winner_and_participants(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    fake.set_pool(1, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})

    contract.sync_pool(1)

    a = contract.get_wallet_stats(alice)
    b = contract.get_wallet_stats(bob)
    assert int(a.pools_won) == 1 and int(a.pools_resolved) == 1
    assert int(b.pools_won) == 0 and int(b.pools_resolved) == 1
    assert contract.is_synced(1) is True
    assert int(contract.get_synced_count()) == 1
    assert int(contract.get_leaderboard_size()) == 2


def test_non_settled_states_ignored(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    fake.set_pool(1, OPEN, 0, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(2, RESOLVING, 0, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(3, REFUNDED, 0, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(4, EMERGENCY, 0, [alice, bob], {alice: 0, bob: 1})

    for pid in (1, 2, 3, 4):
        contract.sync_pool(pid)
        # Not settled, so nothing is recorded and the pool stays unsynced.
        assert contract.is_synced(pid) is False

    assert int(contract.get_synced_count()) == 0
    assert int(contract.get_leaderboard_size()) == 0
    assert int(contract.get_wallet_stats(alice).pools_resolved) == 0


def test_active_pool_later_settles_and_syncs(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    # Active first: ignored and left retryable.
    fake.set_pool(1, OPEN, 0, [alice, bob], {alice: 0, bob: 1})
    contract.sync_pool(1)
    assert contract.is_synced(1) is False

    # Once it settles, the same pool id now counts.
    fake.set_pool(1, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})
    contract.sync_pool(1)
    assert contract.is_synced(1) is True
    assert int(contract.get_wallet_stats(alice).pools_won) == 1


def test_double_sync_is_no_op(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    fake.set_pool(1, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})

    contract.sync_pool(1)
    # Mutate the source after syncing; the idempotency guard must return before
    # re-reading, so the second call changes nothing.
    fake.set_pool(1, SETTLED, 1, [alice, bob], {alice: 0, bob: 1})
    contract.sync_pool(1)

    a = contract.get_wallet_stats(alice)
    assert int(a.pools_won) == 1 and int(a.pools_resolved) == 1
    assert int(contract.get_synced_count()) == 1


def test_whitelisted_non_staker_skipped(direct_vm, direct_deploy, alice, bob, charlie):
    contract, fake = _setup(direct_vm, direct_deploy)
    # charlie is whitelisted but never staked, so get_stake reverts and the
    # leaderboard must skip charlie without counting.
    fake.set_pool(1, SETTLED, 0, [alice, bob, charlie], {alice: 0, bob: 1})

    contract.sync_pool(1)

    assert int(contract.get_leaderboard_size()) == 2
    assert int(contract.get_wallet_stats(charlie).pools_resolved) == 0
    assert int(contract.get_wallet_stats(alice).pools_won) == 1
    assert int(contract.get_wallet_stats(bob).pools_resolved) == 1


def test_duel_shape_counts(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    # A duel settles with two stakers, whitelist equal to participants.
    fake.set_pool(1, SETTLED, 1, [alice, bob], {alice: 0, bob: 1})

    contract.sync_pool(1)

    assert int(contract.get_wallet_stats(bob).pools_won) == 1
    assert int(contract.get_wallet_stats(alice).pools_won) == 0
    assert int(contract.get_wallet_stats(alice).pools_resolved) == 1


def test_open_pool_many_participants(direct_vm, direct_deploy, alice, bob, charlie, dave):
    contract, fake = _setup(direct_vm, direct_deploy)
    fake.set_pool(1, SETTLED, 0, [alice, bob, charlie, dave], {alice: 0, bob: 0, charlie: 1, dave: 1})

    contract.sync_pool(1)

    assert int(contract.get_leaderboard_size()) == 4
    assert int(contract.get_wallet_stats(alice).pools_won) == 1
    assert int(contract.get_wallet_stats(bob).pools_won) == 1
    assert int(contract.get_wallet_stats(charlie).pools_won) == 0
    assert int(contract.get_wallet_stats(dave).pools_resolved) == 1


def test_wins_accumulate_across_pools(direct_vm, direct_deploy, alice, bob):
    contract, fake = _setup(direct_vm, direct_deploy)
    fake.set_pool(1, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(2, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})

    contract.sync_pool(1)
    contract.sync_pool(2)

    a = contract.get_wallet_stats(alice)
    assert int(a.pools_won) == 2 and int(a.pools_resolved) == 2
    b = contract.get_wallet_stats(bob)
    assert int(b.pools_won) == 0 and int(b.pools_resolved) == 2
    # alice is a single distinct wallet despite two pools.
    assert int(contract.get_leaderboard_size()) == 2


def test_win_rate_bps_math(direct_vm, direct_deploy, alice, bob, outsider):
    contract, fake = _setup(direct_vm, direct_deploy)
    # alice participates in three settled pools and wins one: 1 * 10000 // 3.
    fake.set_pool(1, SETTLED, 0, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(2, SETTLED, 1, [alice, bob], {alice: 0, bob: 1})
    fake.set_pool(3, SETTLED, 1, [alice, bob], {alice: 0, bob: 1})
    for pid in (1, 2, 3):
        contract.sync_pool(pid)

    a = contract.get_wallet_stats(alice)
    assert int(a.pools_won) == 1 and int(a.pools_resolved) == 3
    assert int(a.win_rate_bps) == 3333

    # A wallet that has resolved nothing reports zero rather than dividing by zero.
    o = contract.get_wallet_stats(outsider)
    assert int(o.pools_resolved) == 0
    assert int(o.win_rate_bps) == 0


def test_pagination(direct_vm, direct_deploy):
    contract, fake = _setup(direct_vm, direct_deploy)
    # Three settled pools, two distinct stakers each, so six distinct wallets.
    wallets = []
    for p in range(3):
        winner = make_address("pg_w_%d" % p)
        loser = make_address("pg_l_%d" % p)
        wallets.append(winner)
        wallets.append(loser)
        fake.set_pool(p + 1, SETTLED, 0, [winner, loser], {winner: 0, loser: 1})
        contract.sync_pool(p + 1)

    assert int(contract.get_leaderboard_size()) == 6
    assert len(contract.get_leaderboard_range(0, 2)) == 2
    assert len(contract.get_leaderboard_range(4, 2)) == 2
    assert len(contract.get_leaderboard_range(5, 2)) == 1
    assert len(contract.get_leaderboard_range(6, 2)) == 0
    assert len(contract.get_leaderboard_range(0, 100)) == 6

    # Rows carry the per-wallet counters for off-chain sorting.
    rows = contract.get_leaderboard_range(0, 100)
    by_wallet = {r.wallet: r for r in rows}
    first_winner = wallets[0]
    first_loser = wallets[1]
    assert int(by_wallet[first_winner].pools_won) == 1
    assert int(by_wallet[first_winner].pools_resolved) == 1
    assert int(by_wallet[first_loser].pools_won) == 0
    assert int(by_wallet[first_loser].pools_resolved) == 1
