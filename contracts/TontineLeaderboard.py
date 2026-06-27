# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
from genlayer.py.public_abi import StorageType


# Mirrors PoolState.SETTLED in the Tontine contract. Only settled pools feed the
# leaderboard; refunded, cancelled, and active pools contribute nothing.
SETTLED_STATE = 2

# Win rate is reported in integer basis points because the VM has no floats and
# a stored ratio would drift. Callers divide by 100 to render a percentage.
BPS_SCALE = 10000


@dataclass
class WalletStats:
    wallet: Address
    pools_won: u256
    pools_resolved: u256
    win_rate_bps: u256


@dataclass
class LeaderboardEntry:
    wallet: Address
    pools_won: u256
    pools_resolved: u256
    win_rate_bps: u256


class TontineLeaderboard(gl.Contract):
    tontine: Address

    # Idempotency registry. A pool id is recorded here only after it has been
    # fully counted, so a second sync of the same pool is a no-op.
    synced: TreeMap[u256, bool]
    synced_count: u256

    pools_won: TreeMap[Address, u256]
    pools_resolved: TreeMap[Address, u256]

    # Distinct wallets that have been counted at least once. The counters live
    # in TreeMaps, which a view cannot iterate, so this list is what the ranking
    # views enumerate. wallet_seen keeps the list free of duplicates.
    wallets: DynArray[Address]
    wallet_seen: TreeMap[Address, bool]

    def __init__(self, tontine_address: Address):
        # The target is fixed at deploy and never changes, so a zero address
        # would permanently brick the contract.
        if tontine_address == Address(b"\x00" * 20):
            raise gl.vm.UserError("invalid tontine address")
        self.tontine = tontine_address
        self.synced_count = u256(0)

    def _tontine(self):
        # LATEST_FINAL so every validator re-executing sync_pool reads the same
        # finalized Tontine state. Reading non-final state could let validators
        # at different heights diverge and the transaction finish with an error.
        return gl.get_contract_at(self.tontine).view(state=StorageType.LATEST_FINAL)

    def _register_wallet(self, wallet: Address):
        # Append each wallet at most once so the ranking views can enumerate the
        # full set without duplicates.
        if self.wallet_seen.get(wallet, False):
            return
        self.wallet_seen[wallet] = True
        self.wallets.append(wallet)

    @gl.public.write
    def sync_pool(self, pool_id: u256):
        # Idempotency first: a counted pool is skipped, so no result is ever
        # double counted. This guard is load bearing.
        if self.synced.get(pool_id, False):
            return

        t = self._tontine()
        # Cross-contract returns decode to plain dicts and lists, so the struct
        # fields are read by key rather than by attribute.
        pool = t.get_pool(pool_id)

        # Only settled pools count. A pool that is refunded, cancelled, or still
        # active is ignored and left unsynced, since an active pool may settle
        # later and must remain syncable then.
        if int(pool["state"]) != SETTLED_STATE:
            return

        win_idx = int(pool["winning_outcome_index"])
        whitelist = t.get_pool_whitelist(pool_id)

        for w in whitelist:
            # The whitelist is a superset of participants: join_pool requires
            # membership, take_open_slot and join_open_pool add the sender before
            # staking, and create_pool seeds the whitelisted creator's stake. A
            # whitelisted wallet that never staked makes get_stake revert, so a
            # caught UserError marks a non participant to skip.
            try:
                stake = t.get_stake(pool_id, w)
            except gl.vm.UserError:
                continue
            self._register_wallet(w)
            self.pools_resolved[w] = self.pools_resolved.get(w, u256(0)) + u256(1)
            if int(stake["outcome_index"]) == win_idx:
                self.pools_won[w] = self.pools_won.get(w, u256(0)) + u256(1)

        # Mark counted only after the full accumulation. If any read above fails
        # the transaction reverts and the pool stays unsynced and retryable, with
        # no partial counts committed.
        self.synced[pool_id] = True
        self.synced_count = self.synced_count + u256(1)

    def _win_rate_bps(self, won: u256, resolved: u256) -> u256:
        # Zero when nothing is resolved yet, to avoid division by zero.
        if resolved == u256(0):
            return u256(0)
        return (won * u256(BPS_SCALE)) // resolved

    @gl.public.view
    def get_wallet_stats(self, wallet: Address) -> WalletStats:
        won = self.pools_won.get(wallet, u256(0))
        resolved = self.pools_resolved.get(wallet, u256(0))
        return WalletStats(
            wallet=wallet,
            pools_won=won,
            pools_resolved=resolved,
            win_rate_bps=self._win_rate_bps(won, resolved),
        )

    @gl.public.view
    def get_leaderboard_size(self) -> u256:
        return u256(len(self.wallets))

    @gl.public.view
    def get_leaderboard_range(self, offset: u256, limit: u256) -> list:
        # Raw, paginated rows. Ranking is by pools_won, but sorting is left to
        # the caller because an on chain sort over every wallet would be costly
        # and pointless for a read. Pagination bounds the response size.
        n = len(self.wallets)
        start = int(offset)
        if start >= n:
            return []
        end = start + int(limit)
        if end > n:
            end = n
        out = []
        for i in range(start, end):
            w = self.wallets[i]
            won = self.pools_won.get(w, u256(0))
            resolved = self.pools_resolved.get(w, u256(0))
            out.append(
                LeaderboardEntry(
                    wallet=w,
                    pools_won=won,
                    pools_resolved=resolved,
                    win_rate_bps=self._win_rate_bps(won, resolved),
                )
            )
        return out

    @gl.public.view
    def is_synced(self, pool_id: u256) -> bool:
        return self.synced.get(pool_id, False)

    @gl.public.view
    def get_synced_count(self) -> u256:
        return self.synced_count

    @gl.public.view
    def get_tontine_address(self) -> Address:
        return self.tontine
