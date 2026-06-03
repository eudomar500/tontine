"""Pool accounting invariants: stake totals and winner share distribution."""

import random

from conftest import (
    CREATION_FEE,
    MIN_STAKE,
    HOUR,
    BASE_EPOCH,
    create_pool,
    join,
    increase,
    mock_resolution,
    make_address,
    to_iso,
)


def _outcome_totals(pool):
    return [int(o.total_staked) for o in pool.outcomes]


def test_total_pool_matches_outcome_sum_after_random_activity(direct_vm, deploy):
    """total_pool must always equal the sum of every outcome's total_staked.

    A pseudo random sequence of creates, joins and increases is replayed
    against several pools. The seed is fixed so a failure is reproducible.
    """
    contract = deploy()
    rng = random.Random(1337)

    wallets = [make_address(f"player_{i}") for i in range(8)]
    pools = []

    # Create three pools, each whitelisting every wallet so any of them can join.
    for p in range(3):
        creator = wallets[p]
        labels = ["x", "y", "z"]
        pid = create_pool(
            contract,
            direct_vm,
            creator,
            whitelist=wallets,
            outcome_labels=labels,
            creator_outcome_index=p % len(labels),
            creator_stake=MIN_STAKE,
        )
        pools.append((pid, len(labels)))

    # The creator already holds a stake on the pool it opened.
    joined = {pid: {} for pid, _ in pools}
    for idx, (pid, _) in enumerate(pools):
        joined[pid][wallets[idx].as_bytes] = wallets[idx]

    for _ in range(60):
        pid, n_out = rng.choice(pools)
        wallet = rng.choice(wallets)
        key = wallet.as_bytes
        amount = MIN_STAKE * rng.randint(1, 5)
        if key in joined[pid]:
            increase(contract, direct_vm, wallet, pid, amount)
        else:
            join(contract, direct_vm, wallet, pid, rng.randrange(n_out), amount)
            joined[pid][key] = wallet

    for pid, _ in pools:
        pool = contract.get_pool(pid)
        assert int(pool.total_pool) == sum(_outcome_totals(pool))


def test_dust_three_coprime_winners(direct_vm, deploy, alice, bob, charlie, dave):
    """Three winners with pairwise coprime stakes split the pool without overspend.

    Integer division leaves dust in the contract by design. The sum of the
    individual shares must never exceed total_pool, and the final claimant
    must still be able to claim (it cannot run the contract short of funds).
    """
    contract = deploy()
    whitelist = [alice, bob, charlie, dave]

    # Three consecutive integers above the minimum stake are pairwise coprime,
    # which guarantees the division below does not come out even.
    s1 = MIN_STAKE + 1
    s2 = MIN_STAKE + 2
    s3 = MIN_STAKE + 3
    loser_stake = MIN_STAKE + 11

    # alice creates and stakes the winning outcome (index 0).
    pid = create_pool(
        contract,
        direct_vm,
        alice,
        whitelist=whitelist,
        outcome_labels=["win", "lose"],
        creator_outcome_index=0,
        creator_stake=s1,
        value=s1 + CREATION_FEE,
    )
    join(contract, direct_vm, bob, pid, 0, s2)
    join(contract, direct_vm, charlie, pid, 0, s3)
    join(contract, direct_vm, dave, pid, 1, loser_stake)

    direct_vm.warp(to_iso(BASE_EPOCH + 2 * HOUR + 1))
    mock_resolution(direct_vm, outcome_index=0)
    direct_vm.sender = alice
    contract.request_resolution(pid)

    pool = contract.get_pool(pid)
    assert int(pool.state) == 2  # SETTLED
    total = int(pool.total_pool)
    winning_pool = int(pool.outcomes[0].total_staked)
    assert winning_pool == s1 + s2 + s3

    winners = [alice, bob, charlie]
    shares = []
    for w in winners:
        stake = contract.get_stake(pid, w)
        shares.append(int(stake.amount) * total // winning_pool)

    # The accounting invariant: shares never sum above the pool, dust stays behind.
    assert sum(shares) <= total
    assert total - sum(shares) >= 0
    assert total - sum(shares) < len(winners)

    # Every winner can claim, including the last one to arrive.
    for w in winners:
        direct_vm.sender = w
        contract.claim_winnings(pid)
        assert bool(contract.get_stake(pid, w).claimed) is True
