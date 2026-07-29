# Resolution

Pools resolve through the GenLayer LLM oracle. When the resolution deadline passes, any whitelisted participant triggers `request_resolution`. The oracle reads the pool's verification sources, decides the winning outcome, and the contract settles the pot or refunds the stakes.

## Sources

A pool carries two to five distinct HTTPS sources. Prefer JSON API endpoints over rendered web pages.

API endpoints (for example `api.coinbase.com` or `api.binance.com`) return the same payload to every validator, so the oracle converges cleanly. Rendered web pages behind anti-bot protection (Cloudflare and similar) are unreliable: the headless render either fails outright or returns different content to different validators, which drives validators to disagree and can prevent convergence. Use the API whenever one exists.

## Reaching a verdict

The oracle reads every declared source and, evaluating each one in isolation, returns an outcome index per source. The contract collapses that array with plain integer equality: all sources must resolve to the same index for the pool to settle. The comparison runs in deterministic code rather than a second model call, so validators re-running the decision cannot diverge on the check itself. Convergence is compared on the resolved outcome index, not on raw values, so two sources reporting slightly different figures that imply the same outcome still agree.

Validators independently re-run the decision and compare it against the leader's result under the comparative equivalence principle. The principle keys on the reported status, the number of loaded sources, and the settled outcome index, and tolerates wording variance in the evidence. A majority agreement accepts the result.

## Failure handling

Resolution degrades in layers so that a pool is never stranded.

1. Unreadable source. Every declared source must load. If any source returns empty text or raises during the render, the resolution reports `pending` and the pool returns to `OPEN`, retryable. It never settles on fewer sources than the pool declared. A source that loads but yields no determinate outcome is treated the same way.

2. Divergent or inconclusive verdict. If the sources load but resolve to different outcomes, or the oracle returns an out-of-range index or a confidence below the configured threshold, the pool refunds with reason `INCONCLUSIVE`. Every stake is returned in full.

3. Non-convergence across validators. Genuine disagreement across the committee cannot be caught inside the contract, because it is a property of the committee rather than of a single execution. Such a transaction ends in the `UNDETERMINED` state and commits nothing, so the pool stays `OPEN`. It can be retried, and as a final backstop, once the timeout deadline passes any caller can `force_refund` the pool. That path returns every stake in full, with no fee and no proration, under reason `TIMEOUT`.

## Designing a resolution question

Phrase the question with margin. A threshold sitting at the edge of a fast-moving value, for instance a price the asset is currently hovering around, can split validators reading at slightly different moments and prevent convergence. Pick a threshold the outcome clears comfortably, and anchor the question to a fixed reference time so every read targets the same condition.

## Live validation on Bradbury

Tontine `0x700191B420Eb20E14080b00C2C509E95C6B0A640`
Leaderboard `0x8EdBAfa6d2309F3CA274D5b59eC060A6ac558225`

Pool 1 was created, contested by two wallets on opposite outcomes, then resolved and synced end to end against live sources: `api.coinbase.com/v2/prices/BTC-USD/spot` and `api.binance.com/api/v3/ticker/price?symbol=BTCUSDT`.

First resolution attempt, tx `0xb0355d0b2f5b4ee2858e0f8ba0bc35ab938bcc8f0c50a2697308d0316ecd3704`. Validators split on whether every source loaded, the appeal was overturned, and the pool returned to `OPEN` without settling. This is the pending path holding under real conditions: no settlement on fewer sources than declared.

Second attempt, tx `0xa6b30ab05974991cdf8cd3214e4dbefe5e2f064cf943cf7df21123f9bfd4dc19`. Both sources loaded and converged. The evidence recorded on chain reads "Source1: 63847.985 >= 50000; Source2: 63899.85 >= 50000". The raw figures differ, the resolved outcome index does not, which is the comparison convergence performs. The pool settled with `winning_outcome_index` 0, and the stored terms carry the resolution reference, confirming the resolution date reaches the chain.

Leaderboard sync, tx `0x5cb1e3d19ca9d4921bff7d202a491da5fe210ee311b7780098435af347ccb73e`. Two wallets counted from the settled pool, one win and one loss, win rates 10000 and 0 basis points.