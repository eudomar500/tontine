# Resolution

Pools resolve through the GenLayer LLM oracle. When the resolution deadline passes, any whitelisted participant triggers `request_resolution`. The oracle reads the pool's verification sources, decides the winning outcome, and the contract settles the pot or refunds the stakes.

## Sources

A pool carries two to five distinct HTTPS sources. Prefer JSON API endpoints over rendered web pages.

API endpoints (for example `api.coinbase.com` or `api.binance.com`) return the same payload to every validator, so the oracle converges cleanly. Rendered web pages behind anti-bot protection (Cloudflare and similar) are unreliable: the headless render either fails outright or returns different content to different validators, which drives validators to disagree and can prevent convergence. Use the API whenever one exists.

## Reaching a verdict

The oracle reads each source, extracts the relevant value, and produces an outcome index with a confidence score. Validators independently re-run the decision and compare it against the leader's result under the comparative equivalence principle. The principle keys on the outcome index and the factual verdict, and tolerates wording or numeric variance in the evidence. A majority agreement accepts the result.

## Failure handling

Resolution degrades in layers so that a pool is never stranded.

1. Unreadable source. A source that returns empty text or raises during the render is skipped, and resolution proceeds with whatever sources returned usable content.

2. No usable verdict. If no source is usable, or the oracle returns an out-of-range index or a confidence below the configured threshold, the pool refunds with reason `INCONCLUSIVE`. Every stake is returned in full.

3. Non-convergence. Genuine disagreement across validators cannot be caught inside the contract, because it is a property of the committee rather than of a single execution. Such a transaction ends in the `UNDETERMINED` state and commits nothing, so the pool stays `OPEN`. It can be retried, and as a final backstop, once the timeout deadline passes any caller can `force_refund` the pool. That path returns every stake in full, with no fee and no proration, under reason `TIMEOUT`.

## Designing a resolution question

Phrase the question with margin. A threshold sitting at the edge of a fast-moving value, for instance a price the asset is currently hovering around, can split validators reading at slightly different moments and prevent convergence. Pick a threshold the outcome clears comfortably, and anchor the question to a fixed reference time so every read targets the same condition.
