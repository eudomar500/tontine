"""On-chain happy path for the open duel take_open_slot flow.

The direct harness is more permissive than the node, so the new race bearing
auto-inclusion path is exercised once against real consensus: a challenger that
is not whitelisted takes the empty side, and the node must whitelist and stake
it atomically and reflect both sides of the duel.
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


def test_open_duel_take_slot_whitelists_and_stakes_challenger():
    accounts = get_accounts()
    admin, alice = accounts[0], accounts[1]
    for acc in (admin, alice):
        fund(acc.address)

    factory = get_contract_factory("Tontine")
    contract = bind_methods(factory.deploy(args=[addr(admin)], account=admin))

    # Open duel: only the creator is listed, the challenger side stays empty.
    # Trailing args are category, name, is_open_duel.
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
            True,
        ],
    ).transact(value=MIN_STAKE + CREATION_FEE)
    assert tx_execution_succeeded(receipt), "open duel creation failed"
    pid = int(contract.get_pool_count(args=[]).call())

    pool = contract.get_pool(args=[pid]).call()
    assert pool["is_open_duel"] is True

    # The challenger is not whitelisted; take_open_slot must include and stake it.
    challenger = bind_methods(contract.connect(alice))
    take = challenger.take_open_slot(args=[pid, 1]).transact(value=MIN_STAKE)
    assert tx_execution_succeeded(take), "take_open_slot failed"

    assert contract.verify_in_whitelist(args=[pid, addr(alice)]).call() is True
    assert int(contract.get_stake(args=[pid, addr(alice)]).call()["amount"]) == MIN_STAKE

    pool = contract.get_pool(args=[pid]).call()
    assert int(pool["outcomes"][1]["total_staked"]) == MIN_STAKE
    assert int(pool["outcomes"][1]["participants_count"]) == 1
    # Both sides funded: creator stake plus challenger stake, nothing else.
    assert int(pool["total_pool"]) == 2 * MIN_STAKE
