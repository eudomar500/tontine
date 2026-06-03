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


def test_deploy_and_create():
    accounts = get_accounts()
    admin, alice, bob = accounts[0], accounts[1], accounts[2]
    for acc in (admin, alice, bob):
        fund(acc.address)

    factory = get_contract_factory("Tontine")
    contract = bind_methods(factory.deploy(args=[addr(admin)], account=admin))

    assert int(contract.get_creation_fee(args=[]).call()) == CREATION_FEE

    receipt = contract.create_pool(
        args=[
            "Who wins?",
            ["home", "away"],
            ["https://fixtures.test/a", "https://fixtures.test/b"],
            [addr(admin), addr(alice), addr(bob)],
            HOUR,
            2 * HOUR,
            0,
            MIN_STAKE,
        ],
    ).transact(value=MIN_STAKE + CREATION_FEE)
    assert tx_execution_succeeded(receipt)
    assert int(contract.get_pool_count(args=[]).call()) == 1
