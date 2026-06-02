# Tentino

Private peer-to-peer agreement pools on GenLayer, resolved by an LLM oracle over public web sources.

## What it is

Tentino lets a creator open a private pool, invite a fixed set of wallets, and define an event with an objective outcome that can be checked against public web sources. Participants stake native GEN on the outcome they expect. After the event, the pool is resolved by GenLayer's LLM consensus reading the declared sources, and the winning side splits the pot pro-rata to each stake.

Pools are private by whitelist: only invited wallets can join. Everything else is public. There is no confidentiality layer and the project does not promise anonymity. Wallets and amounts are visible on-chain, in line with how Polymarket and Augur work.

## How it works

A pool moves through a small set of states:

- `OPEN`: accepts entries until the join deadline.
- `RESOLVING`: resolution requested, LLM reading the sources.
- `SETTLED`: resolved, the winning side can claim.
- `REFUNDED`: cancelled, timed out, or no real contest; everyone reclaims their stake.
- `EMERGENCY`: killswitch active, stakes recoverable directly.

Resolution requires at least two distinct HTTPS sources and convergence between them. If the sources disagree, the model is not confident enough, or no single outcome can be established, the pool does not settle and funds are returned.

Payouts are pari-mutuel: the winning side splits the entire pot in proportion to each stake. The platform never takes a cut of the pot. The only platform revenue is a fixed creation fee paid once by the pool creator, separate from the stakes.

## Architecture

A single intelligent contract holds all pools, indexed by id. There is no on-chain factory; one contract serves every pool. Native GEN only in this version, with an asset abstraction reserved for future asset types.

## Status

In development on GenLayer Bradbury testnet. The contract passes local linting and validation. Not audited by a third party, not deployed to mainnet. Do not use with real funds.

## Local development

Requires Node.js 18+ for the GenLayer CLI and Python 3.12 for the test tooling.

    npm install -g genlayer
    python3 -m venv .venv
    source .venv/bin/activate

The contract lives in `contracts/tentino.py`. Lint and validate it with the GenLayer dev tooling before any deploy.

## License

TBD
