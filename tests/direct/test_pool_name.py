"""The optional cosmetic name on a pool: round trip, empty default, length bound.

The name is a frontend room label with no economic effect. The contract keeps
it permissive on purpose (empty is valid) and enforces only a length bound,
since the contract is immutable post deploy and any stricter policy lives in the
frontend.
"""

from conftest import create_pool

MAX_NAME_LEN = 64


def test_name_round_trips_through_get_pool(direct_vm, deploy, alice, bob):
    contract = deploy()
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob], name="Friday Night")

    pool = contract.get_pool(pid)
    assert pool.name == "Friday Night"
    # The list and card view read the summary, so the name must be there too.
    summary = contract.get_pool_summary(pid)
    assert summary.name == "Friday Night"


def test_empty_name_is_valid_and_blank(direct_vm, deploy, alice, bob):
    contract = deploy()
    # No name override, so it defaults to empty and the frontend omits the prefix.
    pid = create_pool(contract, direct_vm, alice, whitelist=[alice, bob])

    assert contract.get_pool(pid).name == ""
    assert contract.get_pool_summary(pid).name == ""


def test_name_over_max_length_reverts(direct_vm, deploy, alice, bob):
    contract = deploy()
    too_long = "x" * (MAX_NAME_LEN + 1)

    # Length is the only name rule, and it is enforced on chain, not just in the
    # frontend, so it is not a harness only path.
    with direct_vm.expect_revert("name too long"):
        create_pool(contract, direct_vm, alice, whitelist=[alice, bob], name=too_long)
