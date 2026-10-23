# Parcel Tracking Engine challenge

Implement the engine independently in any language. `participant/` is intentionally empty. Read [SPEC.md](SPEC.md) for the complete deterministic protocol, validation precedence, state transitions, and anomaly ordering. The harness's private reference implementation lives only in `harness/`; it is verification infrastructure, not participant starter code.

Requires Node.js 20+ and npm on PATH. There are no package dependencies or install step.

```sh
npm run test -- --command "node participant/main.js"
npm run test -- --command "python participant/main.py" --seed shipment-42 --cases 36 --timeout 5000 --verbose
npm run test:harness
```

Run these commands from this directory. The command runs through the platform shell with this working directory; quote paths according to your shell. Only run trusted participant commands. Language runtimes must be installed separately. Emit only JSONL on stdout, flush each response, and handle multiple lines in a single process until EOF.

Options: `--seed` is an arbitrary string (default `1`); `--cases` is a positive integer (default `32`); `--timeout` is an integer from 1 through 2147483647 in milliseconds per response and for shutdown after EOF (default `5000`); `--verbose` prints passing case names and the full failing request. Case failures exit with code 1 and include seed, case ID, category, first differing JSON path where applicable, and recent participant stderr. Session failures such as unsolicited output or unsuccessful shutdown also exit with code 1. Success exits with code 0. Stdout is bounded to 32 MiB per buffered response; stderr retains the last 8192 UTF-16 code units. The runner requests process-tree termination on failure and releases its streams. This runner is not a sandbox for untrusted programs. The first response timeout includes runtime startup; compile submissions before timing them and use the same generous timeout and environment for all candidates.

Cases cycle through 16 categories: delivery, multiple facilities, sorting loops, shuffled arrival, identical/conflicting duplicates, invalid transitions, missing creation, events after both terminal states, 2500 parcels, simultaneous shipments, malformed events, tied timestamps, identifier/numeric boundaries, all 49 state pairs, empty batches, and invalid request envelopes. Use at least 16 cases for every category; the default runs two rounds. Invalid-envelope variants rotate over six rounds (96 cases covers them all). A seed and count reproduce identical inputs within this harness version. Case counts below 16 intentionally cover only the prefix. The runner compares the entire response, including history, facilities, timestamps, anomalies, errors, ordering, and extra/missing keys. Each request is a separate batch and all deduplication is batch-local.

For hiring, keep `harness/` assessor-owned: distribute SPEC.md, examples/, and an empty participant directory to candidates. Do not give candidates the oracle or the oracle-backed self-test fixture. Run the harness externally against their executable. This is a binary correctness gate for the chosen suite, not a numeric hiring score: a case passes only if the entire response matches, and the session must exit cleanly. No credit is inferred from stdout claims, a short case prefix, or a percentage of generated cases. Fix the seed list, case count, runtime versions, and timeout before comparing candidates. A suitable full assessment uses multiple fixed seeds with 96 cases each. Code quality and independent authorship require separate human review; this local runner cannot enforce either.

[examples/input.jsonl](examples/input.jsonl) and [examples/output.jsonl](examples/output.jsonl) show a two-request session. Dedicated harness tests use literal expectations, every state pair, malformed inputs, deterministic generation, scale checks, and subprocess fixtures for protocol errors, incorrect output, timeouts, and premature exits. The fixture under `harness/tests/` is only for self-testing and must not be imported by participant code.
