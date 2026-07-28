"""On-chain proof of the leaderboard cross-contract read and revert-catch.

This deploys both contracts, settles a pool on Tontine that includes a
whitelisted wallet which never staked, then calls sync_pool on the leaderboard.
It exercises the two behaviors that the permissive direct harness cannot fully
vouch for: the real cross-contract read of Tontine views, and the get_stake
revert-catch that distinguishes the whitelisted non-staker from real
participants. The non-staker (bob) must be skipped, and the winner and loser
counted, all read back from the leaderboard on chain.
"""

from gltest import get_contract_factory
from gltest.accounts import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import (
    MIN_STAKE,
    CREATION_FEE,
    HOUR,
    REPO_ROOT,
    rpc,
    addr,
    fund,
    bind_methods,
    install_mocks,
    clear_mocks,
    advance_past,
)

SETTLED = 2


def _fetch_leaderboard_schema():
    # The node returns an empty method set for the schema RPC once deploys have
    # run, so this must be called before any deploy in the test.
    code = (REPO_ROOT / "contracts" / "TontineLeaderboard.py").read_bytes().hex()
    for _ in range(10):
        candidate = rpc("gen_getContractSchemaForCode", ["0x" + code])
        if candidate and candidate.get("methods"):
            return candidate
    raise RuntimeError("leaderboard schema unavailable from node")


def test_sync_counts_settled_pool_and_skips_non_staker():
    # Capture the leaderboard schema up front, before any deploy runs.
    leaderboard_schema = _fetch_leaderboard_schema()
    leaderboard_factory = get_contract_factory("TontineLeaderboard")

    accounts = get_accounts()
    admin, alice, bob = accounts[0], accounts[1], accounts[2]
    for acc in (admin, alice, bob):
        fund(acc.address)

    tontine = bind_methods(
        get_contract_factory("Tontine").deploy(args=[addr(admin)], account=admin)
    )

    source_a = "https://fixtures.test/lb/a"
    source_b = "https://fixtures.test/lb/b"
    # bob is whitelisted but will not stake, which is what forces get_stake to
    # revert during the sync and proves the revert-catch on chain.
    receipt = tontine.create_pool(
        args=[
            "Who wins?",
            ["home", "away"],
            [source_a, source_b],
            [addr(admin), addr(alice), addr(bob)],
            HOUR,
            2 * HOUR,
            0,
        ],
    ).transact(value=MIN_STAKE + CREATION_FEE)
    assert tx_execution_succeeded(receipt), "pool creation failed"
    pid = int(tontine.get_pool_count(args=[]).call())

    join = bind_methods(tontine.connect(alice)).join_pool(args=[pid, 1]).transact(value=MIN_STAKE)
    assert tx_execution_succeeded(join), "alice join failed"

    report = "Final result: the home team won. The home side is the champion."
    install_mocks(
        {source_a: {"status": 200, "body": report}, source_b: {"status": 200, "body": report}},
        llm={"impartial resolver": '{"reasoning": "home won", "per_source": [0, 0], "confidence": 95, "evidence": "home won"}'},
    )

    deadline = int(tontine.get_pool(args=[pid]).call()["resolution_deadline"])
    advance_past(deadline)
    settle = bind_methods(tontine.connect(admin)).request_resolution(args=[pid]).transact()
    assert tx_execution_succeeded(settle), "resolution failed"
    assert int(tontine.get_pool(args=[pid]).call()["state"]) == SETTLED
    clear_mocks()

    leaderboard = leaderboard_factory.deploy(args=[addr(tontine.address)], account=admin)
    leaderboard._schema = leaderboard_schema
    leaderboard._build_methods_from_schema()

    synced = bind_methods(leaderboard.connect(admin)).sync_pool(args=[pid]).transact()
    assert tx_execution_succeeded(synced), "sync_pool failed"

    assert leaderboard.is_synced(args=[pid]).call() is True
    # Two participants counted, the whitelisted non-staker skipped.
    assert int(leaderboard.get_leaderboard_size(args=[]).call()) == 2

    admin_stats = leaderboard.get_wallet_stats(args=[addr(admin)]).call()
    assert int(admin_stats["pools_won"]) == 1
    assert int(admin_stats["pools_resolved"]) == 1

    alice_stats = leaderboard.get_wallet_stats(args=[addr(alice)]).call()
    assert int(alice_stats["pools_won"]) == 0
    assert int(alice_stats["pools_resolved"]) == 1

    bob_stats = leaderboard.get_wallet_stats(args=[addr(bob)]).call()
    assert int(bob_stats["pools_resolved"]) == 0
