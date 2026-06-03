# Integration tests

These tests exercise the full resolution path against a local glsim node with a
real LLM. Unlike the direct-mode tests, they run actual consensus and make live
model calls, so they are slower and depend on a configured LLM provider.

## Requirements

- glsim (bundled with the GenLayer tooling)
- An LLM provider configured through `.env`. Tested with `anthropic:claude-haiku-4-5`.
  Set `ANTHROPIC_API_KEY` in `.env` (never commit it; it is gitignored).

## Running

    gltest tests/integration/ --network localnet

Source pages are served as fixed in-memory mocks through glsim, so the model
decides on deterministic content with no dependency on live external pages.

## What is covered

- Happy resolution to the correct outcome, winner claim.
- Prompt injection: a hostile source cannot steer the verdict to its chosen outcome.
- Contradictory sources do not converge and do not settle.
- A failing source (4xx/5xx) aborts before the model runs.
- An out-of-range index from the model is rejected by the contract.

## Known limitations

- Runs leader-only by default (`GLSIM_VALIDATORS=1`); the multi-validator path
  hits a glsim limitation for stateful nondet methods. Multi-validator convergence
  is validated on the real network, not here.
- glsim does not roll back state on revert, so negative cases assert "not settled"
  plus a failed transaction rather than a return to the OPEN state.
