"""On-chain happy path for the open pool join_open_pool flow.

The direct harness is more permissive than the node, so the auto-inclusion join
path is exercised once against real consensus: a wallet that is not whitelisted
joins an open pool directly, and the node must whitelist and stake it.
"""

from gltest import get_contract_factory
from gltest.accounts import get_accounts
from gltest.assertions import tx_execution_succeeded

from conftest import (
    MIN_STAKE,
    CREATION_FEE,
    HOUR,
    addr,
    fund,
    bind_methods,
)


def test_open_pool_join_whitelists_and_stakes_joiner():
    accounts = get_accounts()
    admin, alice = accounts[0], accounts[1]
    for acc in (admin, alice):
        fund(acc.address)

    factory = get_contract_factory("Tontine")
    contract = bind_methods(factory.deploy(args=[addr(admin)], account=admin))

    # Open pool: only the creator is listed, anyone may join later.
    # Trailing args are category, name, is_open_duel, is_open.
    receipt = contract.create_pool(
        args=[
            "Who wins?",
            ["home", "away"],
            ["https://fixtures.test/a", "https://fixtures.test/b"],
            [addr(admin)],
            HOUR,
            2 * HOUR,
            0,
            "",
            "",
            False,
            True,
        ],
    ).transact(value=MIN_STAKE + CREATION_FEE)
    assert tx_execution_succeeded(receipt), "open pool creation failed"
    pid = int(contract.get_pool_count(args=[]).call())

    pool = contract.get_pool(args=[pid]).call()
    assert pool["is_open"] is True

    # The joiner is not whitelisted; join_open_pool must include and stake it.
    joiner = bind_methods(contract.connect(alice))
    joined = joiner.join_open_pool(args=[pid, 1]).transact(value=MIN_STAKE)
    assert tx_execution_succeeded(joined), "join_open_pool failed"

    assert contract.verify_in_whitelist(args=[pid, addr(alice)]).call() is True
    assert int(contract.get_stake(args=[pid, addr(alice)]).call()["amount"]) == MIN_STAKE

    pool = contract.get_pool(args=[pid]).call()
    assert int(pool["outcomes"][1]["total_staked"]) == MIN_STAKE
    assert int(pool["outcomes"][1]["participants_count"]) == 1
    assert int(pool["total_pool"]) == 2 * MIN_STAKE
