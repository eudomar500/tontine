# Tontine

Private peer-to-peer agreement pools on GenLayer, resolved by an LLM oracle over public web sources.

## What it is

Tontine lets a creator open a pool around an event with an objective outcome that can be checked against public web sources. An event can carry between two and ten possible outcomes, not just a binary yes or no, so a pool can frame questions with several distinct results, such as which option occurs or which range a value falls into. Participants stake native GEN on the outcome they expect. After the event, the pool is resolved by GenLayer's LLM consensus reading the declared sources, and the winning side splits the pot pro-rata to each stake.

Every pool is private: membership is a bounded whitelist controlled by the creator. The creator can fill that whitelist in one of two ways, either listing the wallets at creation, or letting wallets add themselves on a first-come basis until the whitelist reaches its limit (at most 100 on testnet) and closes. The pool stays private and capped either way; first-come filling is just another way to complete a limited list, not an open pool.

A pool can also be framed as a one-versus-one duel: exactly two sides of the same event, either between two chosen wallets or with one side left open for the first challenger to take. A duel is still a pool under the hood, presented as a head-to-head match.

Everything is public. There is no confidentiality layer and the project does not promise anonymity. Wallets and amounts are visible on-chain, in line with how Polymarket and Augur work.

## How it works

A pool moves through a small set of states:

- `OPEN`: accepts entries until the join deadline.
- `RESOLVING`: resolution requested, LLM reading the sources.
- `SETTLED`: resolved, the winning side can claim once the result is final.
- `REFUNDED`: cancelled, timed out, or no real contest; everyone reclaims their stake.
- `EMERGENCY`: killswitch active, stakes recoverable directly.

Payouts are pari-mutuel: the winning side splits the entire pot in proportion to each stake. The platform never takes a cut of the pot. The only platform revenue is a fixed creation fee paid once by the pool creator, separate from the stakes.

## Resolution

Resolution runs through GenLayer's optimistic-democracy consensus. Once the resolution deadline passes, any participant on the pool can trigger it. The model reads the pool's declared sources with `web.render` and decides the outcome. Resolution requires at least two distinct HTTPS sources and convergence between them above a confidence threshold of 0.7. If the sources disagree, the model is not confident enough, or no single outcome can be established, the pool does not settle and funds are returned.

A resolution is not final the instant it is decided. GenLayer first marks it accepted, which is provisional and can still be overturned during an appeal window, and only later finalized, which is immutable. Tontine gates winnings on finality: the claim is offered only once the resolution transaction reaches finalized, never on accepted. This prevents a participant from claiming against a result that an appeal could still change. While the resolution is accepted but not yet finalized, the pool reads as settled but the claim stays locked until finality lands.

## Security

The contract is built to fail safe and to keep funds recoverable even if the operator disappears:

- Two-step admin transfer, so control cannot pass to a wrong or hostile address in a single transaction.
- A 48-hour timelock on creation-fee changes, with the fee capped (1 GEN initially, 100 GEN maximum).
- A pause switch that halts new activity but never blocks claims or emergency withdrawals.
- A killswitch that, once armed, opens direct stake recovery after a 7-day delay.
- A dead-man's switch that lets participants recover funds if the operator is inactive for 90 days.
- Automatic refunds when a pool passes its timeout without resolving.

The whitelist is purely an access-control set and is kept independent from all stake accounting, so allowing wallets to join it never affects payouts, counts, or totals. Whitelist growth is append-only, deduplicated, and bounded by the same capacity limit, and is only possible while a pool is open.

## Architecture

A single intelligent contract holds all pools, indexed by id. There is no on-chain factory; one contract serves every pool. Native GEN only in this version, with an asset abstraction reserved for future asset types. A separate leaderboard contract is planned to aggregate reputation and activity, kept independent so the core pool contract stays small and the design remains fully on-chain without external indexers.

Because contracts are immutable after deployment on Bradbury, every contract change ships as a fresh redeploy rather than an in-place upgrade, and the live build version is readable on-chain.

## Status

In development on GenLayer Bradbury testnet. The contract is deployed and the core flows have been validated end to end on testnet: pool creation, joining, resolution, the finality-gated claim, refunds, duels including the open-challenger path, and creator-controlled whitelist joining. Not audited by a third party, not deployed to mainnet. Do not use with real funds.

## Local development

Requires Node.js 18+ for the GenLayer CLI and Python 3.12 for the test tooling.

    npm install -g genlayer
    python3 -m venv .venv
    source .venv/bin/activate

The contract lives in `contracts/tontine.py`. Lint and validate it with the GenLayer dev tooling before any deploy.

## License

All rights reserved. No license is granted to use, copy, modify, or distribute this code.
