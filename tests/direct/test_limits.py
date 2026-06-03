"""MAX_POOLS_PER_WALLET enforcement on both create_pool and join_pool.

The production limit is 1000 pools per wallet. Driving that many pools through
a test would be wasteful, so the module constant is lowered to 1 for the
duration of the test. The guard reads the module global on each call, so the
override takes effect immediately.
"""

from conftest import (
    MIN_STAKE,
    create_pool,
    join,
    contract_module,
)


def test_create_pool_limit_per_wallet(direct_vm, deploy, alice, bob):
    contract = deploy()
    contract_module().MAX_POOLS_PER_WALLET = 1

    create_pool(contract, direct_vm, alice, whitelist=[alice, bob])

    with direct_vm.expect_revert("wallet pool limit reached"):
        create_pool(contract, direct_vm, alice, whitelist=[alice, bob])


def test_join_pool_limit_per_wallet(direct_vm, deploy, alice, bob, charlie):
    contract = deploy()
    contract_module().MAX_POOLS_PER_WALLET = 1

    first = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])
    second = create_pool(contract, direct_vm, charlie, whitelist=[charlie, bob])

    # bob's first join is accepted and indexed.
    join(contract, direct_vm, bob, first, 1, MIN_STAKE)

    # The second join would push bob past the limit.
    direct_vm.sender = bob
    direct_vm.value = MIN_STAKE
    with direct_vm.expect_revert("wallet pool limit reached"):
        contract.join_pool(second, 1)
