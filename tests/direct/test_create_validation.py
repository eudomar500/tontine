"""Every create_pool validation branch, each exercised on its own."""

import pytest

from conftest import (
    CREATION_FEE,
    MIN_STAKE,
    HOUR,
    pool_kwargs,
    make_address,
    zero_address,
)

MAX_POOL_DURATION = 7776000


def _pause(contract, vm, admin):
    vm.sender = admin
    contract.set_pause(True)


def _killswitch(contract, vm, admin):
    # Arming the killswitch also sets paused, which is what blocks creation.
    vm.sender = admin
    contract.activate_killswitch()


# Each case: human id, optional pre-state setup, create_pool overrides, value
# override (None means stake plus fee), and the substring the revert must carry.
CASES = [
    ("paused", _pause, {}, None, "contract paused"),
    # The killswitch blocks creation through the pause flag it sets; create_pool
    # has no separate killswitch guard.
    ("killswitch_blocks_create", _killswitch, {}, None, "contract paused"),
    ("too_few_outcomes", None, {"outcome_labels": ["only"]}, None, "outcomes count out of range"),
    (
        "too_many_outcomes",
        None,
        {"outcome_labels": [f"o{i}" for i in range(11)]},
        None,
        "outcomes count out of range",
    ),
    ("empty_outcome_label", None, {"outcome_labels": ["", "b"]}, None, "empty outcome label"),
    (
        "outcome_label_too_long",
        None,
        {"outcome_labels": ["x" * 501, "b"]},
        None,
        "outcome label too long",
    ),
    ("duplicate_outcome_label", None, {"outcome_labels": ["a", "a"]}, None, "duplicate outcome label"),
    (
        "too_few_sources",
        None,
        {"resolution_sources": ["https://ex.com/a"]},
        None,
        "sources count out of range",
    ),
    (
        "too_many_sources",
        None,
        {"resolution_sources": [f"https://ex.com/{i}" for i in range(6)]},
        None,
        "sources count out of range",
    ),
    (
        "non_https_source",
        None,
        {"resolution_sources": ["http://ex.com/a", "https://ex.com/b"]},
        None,
        "invalid source URL",
    ),
    (
        "duplicate_source",
        None,
        {"resolution_sources": ["https://ex.com/a", "https://ex.com/a"]},
        None,
        "duplicate source URL",
    ),
    ("whitelist_too_small", None, {"whitelist": "CREATOR_ONLY"}, None, "whitelist size out of range"),
    ("zero_in_whitelist", None, {"whitelist": "WITH_ZERO"}, None, "zero address in whitelist"),
    ("duplicate_in_whitelist", None, {"whitelist": "WITH_DUP"}, None, "duplicate in whitelist"),
    ("creator_absent", None, {"whitelist": "WITHOUT_CREATOR"}, None, "creator not in whitelist"),
    ("join_window_too_short", None, {"join_deadline_offset": 100}, None, "join window too short"),
    (
        "resolution_gap_too_short",
        None,
        {"join_deadline_offset": HOUR, "resolution_deadline_offset": HOUR + 100},
        None,
        "resolution gap too short",
    ),
    (
        "duration_exceeds_max",
        None,
        {"resolution_deadline_offset": MAX_POOL_DURATION + 1},
        None,
        "pool duration exceeds max",
    ),
    ("invalid_outcome_index", None, {"creator_outcome_index": 5}, None, "invalid outcome index"),
    ("terms_empty", None, {"terms": ""}, None, "terms empty"),
    ("terms_too_long", None, {"terms": "x" * 2001}, None, "terms too long"),
    ("stake_below_minimum", None, {"creator_stake": MIN_STAKE - 1}, None, "stake below minimum"),
    ("insufficient_value", None, {}, MIN_STAKE, "insufficient value"),
]


def _resolve_whitelist(token, creator):
    other_a = make_address("wl_a")
    other_b = make_address("wl_b")
    if token == "CREATOR_ONLY":
        return [creator]
    if token == "WITH_ZERO":
        return [creator, zero_address()]
    if token == "WITH_DUP":
        return [creator, other_a, other_a]
    if token == "WITHOUT_CREATOR":
        return [other_a, other_b]
    return token


@pytest.mark.parametrize("name,setup,overrides,value,message", CASES, ids=[c[0] for c in CASES])
def test_create_pool_validation(direct_vm, deploy, admin, alice, name, setup, overrides, value, message):
    contract = deploy()
    if setup is not None:
        setup(contract, direct_vm, admin)

    overrides = dict(overrides)
    if "whitelist" in overrides and isinstance(overrides["whitelist"], str):
        overrides["whitelist"] = _resolve_whitelist(overrides["whitelist"], alice)

    args = pool_kwargs(alice, **overrides)
    direct_vm.sender = alice
    direct_vm.value = value if value is not None else int(args["creator_stake"]) + CREATION_FEE
    with direct_vm.expect_revert(message):
        contract.create_pool(
            args["terms"],
            args["outcome_labels"],
            args["resolution_sources"],
            args["whitelist"],
            args["join_deadline_offset"],
            args["resolution_deadline_offset"],
            args["creator_outcome_index"],
            args["creator_stake"],
        )
