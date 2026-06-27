"""A controllable stand in for the Tontine contract used by leaderboard tests.

Direct mode does not route cross-contract calls to another deployed contract; it
delegates them to a hook on the VM. This module provides that hook plus a small
fake that returns exactly the shapes a real cross-contract read would decode to:
get_pool and get_stake return plain dicts keyed by field name, get_pool_whitelist
returns a list of Address, and a missing stake raises like the real get_stake.

The fake lets the accumulation and idempotency logic be driven precisely. The
real cross-contract read and the real get_stake revert are proven separately by
the on-chain integration test, since the harness has been more permissive than
the node before on this project.
"""


class FakeRevert(Exception):
    """Marks a fake Tontine view revert, mapped to a USER_ERROR result."""


class FakePool:
    def __init__(self, state, winning_outcome_index, whitelist, stakes):
        # stakes maps a wallet address (as bytes) to its staked outcome index.
        # The whitelist is a superset of the stakers, matching the real contract.
        self.state = state
        self.winning_outcome_index = winning_outcome_index
        self.whitelist = whitelist
        self.stakes = stakes


class FakeTontine:
    def __init__(self):
        self.pools = {}

    def set_pool(self, pool_id, state, winning_outcome_index, whitelist, stakes):
        by_bytes = {w.as_bytes: idx for w, idx in stakes.items()}
        self.pools[int(pool_id)] = FakePool(state, winning_outcome_index, whitelist, by_bytes)

    def dispatch(self, method, args):
        if method == "get_pool":
            pool = self._pool(args[0])
            return {"state": pool.state, "winning_outcome_index": pool.winning_outcome_index}
        if method == "get_pool_whitelist":
            return [w for w in self._pool(args[0]).whitelist]
        if method == "get_stake":
            pool = self._pool(args[0])
            key = args[1].as_bytes
            if key not in pool.stakes:
                raise FakeRevert("no stake")
            return {"outcome_index": pool.stakes[key]}
        raise FakeRevert("unknown method")

    def _pool(self, pool_id):
        pool = self.pools.get(int(pool_id), None)
        if pool is None:
            raise FakeRevert("pool not found")
        return pool


def make_hook(tontine_addr, fake):
    """Build a VM gl_call hook that serves cross-contract reads from the fake."""

    def hook(vm, request):
        call = request.get("CallContract")
        if call is None:
            return None
        if call["address"].as_bytes != tontine_addr.as_bytes:
            return None
        from genlayer.py import calldata
        from genlayer.py.public_abi import ResultCode

        payload = call["calldata"]
        method = payload["method"]
        args = payload.get("args", [])
        try:
            value = fake.dispatch(method, args)
        except FakeRevert as e:
            return bytes([ResultCode.USER_ERROR]) + str(e).encode("utf-8")
        return bytes([ResultCode.RETURN]) + calldata.encode(value)

    return hook
