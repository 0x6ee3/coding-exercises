# Parcel Tracking Engine

Build an engine that reconstructs parcel states from unordered scan events, validates transitions, and reports anomalies. Implement it independently in any language inside `participant/`, which starts empty.

Read [SPEC.md](SPEC.md) for the complete protocol, validation rules, state transitions, and anomaly ordering. The reference implementation in `harness/` supports verification; it is not starter code for your solution.

## Scenario coverage

Generated cases cycle through 16 categories:

| Category | What it exercises |
| --- | --- |
| Delivery | Successful deliveries and returns |
| Multiple facilities | Tracking the facility of the most recent accepted scan |
| Sorting loops | Repeated transit and sorting-center visits |
| Shuffled arrival | Processing scans by event order rather than arrival order |
| Duplicates | Identical and conflicting scans sharing an event ID |
| Invalid transitions | Rejecting disallowed state changes |
| Missing creation | Scans without an accepted CREATED event |
| After terminal states | Scans after delivery or return |
| Scale | Batches containing 2,500 parcels |
| Simultaneous shipments | Interleaved parcels with overlapping timestamps |
| Malformed events | Missing fields, incorrect types, and invalid values |
| Tied timestamps | Breaking ties by event ID |
| Boundaries | Identifier preservation, capitalization, and numeric limits |
| State pairs | All 49 pairs of current and next statuses |
| Empty batches | Requests containing no events |
| Invalid requests | Incorrect request structures |

Use at least 16 cases to cover every category; the default runs two rounds. Invalid-request variants rotate over six rounds, so 96 cases covers them all. Counts below 16 cover only the initial categories. The same seed and case count reproduce identical inputs within this harness version. Each request is an independent batch.

## Requirements

Install Node.js 20+ and npm, plus the runtime or compiler for your chosen language. There are no package dependencies or install step. Compile your program before running the harness if your language requires it.

## Run your solution

Run these commands from this directory:

```sh
npm run test -- --command "node participant/main.js"
npm run test -- --command "python participant/main.py" --seed shipment-42 --cases 96 --timeout 5000 --verbose
```

The participant command runs through the platform shell with this working directory; quote paths according to your shell. Your program must read JSONL from stdin, write and flush one JSONL response per request, and remain running until stdin closes. Send debugging output to stderr.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--command` | Required | Command that starts your program |
| `--seed` | `1` | Arbitrary string used to reproduce generated inputs |
| `--cases` | `32` | Positive integer specifying how many requests to test |
| `--timeout` | `5000` | Milliseconds allowed per response and for shutdown after EOF; integer from 1 through 2147483647 |
| `--verbose` | Off | Print passing case names and the full failing request |

The first response timeout includes runtime startup. Increase the timeout if your runtime needs more time to start or process large batches.

## Results and diagnostics

The harness compares the entire response: statuses, history, facilities, timestamps, anomalies, errors, array ordering, and missing or extra fields. A run passes only when every response matches and the program exits successfully after EOF.

Success exits with code 0; failures exit with code 1. Case failures report the seed, case ID, category, first differing JSON path where applicable, and recent participant stderr. Session failures also report unsolicited output or unsuccessful shutdown. Use `--verbose` to inspect the failing input, then rerun with the same seed and case count.

Stdout is bounded to 32 MiB per buffered response, and the last 8192 UTF-16 code units of stderr are retained. On failure, the runner requests process-tree termination and releases its streams. It runs your command locally and is not a sandbox for untrusted programs.

## Examples

[examples/input.jsonl](examples/input.jsonl) and [examples/output.jsonl](examples/output.jsonl) show a two-request session.

## Verify the harness

```sh
npm run test:harness
```

The dedicated tests check literal expected results, every state pair, malformed inputs, deterministic generation, large batches, and runner behavior for protocol errors, incorrect output, timeouts, and premature exits. Fixtures under `harness/tests/` are for testing the harness; do not import them into your solution.
