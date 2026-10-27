# Parcel Tracking Engine

Build an engine that reconstructs parcel states from unordered scan events, checks transitions, and reports anomalies. Implement it independently in any language inside `participant/`, which starts empty.

Read [SPEC.md](SPEC.md) for the complete protocol, input guarantees, state transitions, and anomaly ordering. The reference implementation in `harness/` supports verification; it is not starter code for your solution.

## Scenario coverage

Generated cases cycle through 14 categories:

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
| Tied timestamps | Breaking ties by event ID, including ordinal uppercase/lowercase ordering |
| Boundaries | Identifier preservation, capitalization, and numeric limits |
| State pairs | All 49 pairs of current and next statuses |
| Empty batches | Requests containing no events |

Use at least 14 cases to cover every category; the default runs 32 cases. The same seed and case count reproduce identical inputs within this harness version. Each request is an independent batch.

All inputs are valid JSON with a fixed request/event structure. Every event field is present and has the correct type; no input field is null. Use your language's standard JSON library and ordinary typed models. Malformed JSON, missing fields, wrong types, and invalid field values are outside the assessment. The challenge focuses on deduplication, ordering, and parcel state transitions.

Responses contain `requestId` and `parcels`, with no request-level errors array. All output fields are non-null. Before an accepted CREATED event, a parcel has status `NOT_CREATED`, currentFacility `""`, lastUpdated `0`, and empty history. See SPEC.md for the exact output shape.

## Requirements

Install Node.js 24+ and npm, plus the runtime or compiler for your chosen language. The harness runs without installing packages. Compile your program before running the harness if your language requires it.

For TypeScript editor support and strict typechecking of `participant/**/*.ts`, install the development dependencies and run:

```sh
npm ci
npm run typecheck
```

The root `tsconfig.json` provides Node.js types and settings compatible with native TypeScript execution. The command checks both `harness/**/*.ts` and `participant/**/*.ts`, and also works while `participant/` is empty. Typechecking does not emit compiled files.

## Run your solution

Run these commands from this directory:

```sh
npm run test
npm run test -- --seed shipment-42 --cases 96
npm run test -- --command "node participant/main.js"
npm run test -- --command "python participant/main.py" --seed shipment-42 --cases 96 --timeout 5000 --verbose
```

Without `--command`, the harness runs `participant/main.ts` with the same Node.js executable as the harness. Native TypeScript support strips types without typechecking; use explicit `.ts` extensions for local imports and `import type` for type-only imports. Syntax requiring code generation, such as enums and parameter properties, and `tsconfig.json` path aliases require a custom command with your own TypeScript runner or build step.

A custom `--command` takes precedence and runs through the platform shell with this working directory; quote paths according to your shell. Your program must read JSONL from stdin, write and flush one JSONL response per request, and remain running until stdin closes. Send debugging output to stderr.

### Options

| Option | Default | Description |
| --- | --- | --- |
| `--command` | `node participant/main.ts` | Optional shell command that overrides the default TypeScript entry point |
| `--seed` | `1` | Arbitrary string used to reproduce generated inputs |
| `--cases` | `32` | Positive integer specifying how many requests to test |
| `--timeout` | `5000` | Milliseconds allowed per response and for shutdown after EOF; integer from 1 through 2147483647 |
| `--verbose` | Off | Print passing case names and the full failing request |

The first response timeout includes runtime startup. Increase the timeout if your runtime needs more time to start or process large batches.

## Results and diagnostics

The harness compares the entire response: statuses, history, facilities, timestamps, anomalies, array ordering, and missing or extra fields. A run passes only when every response matches and the program exits successfully after EOF.

Success exits with code 0; failures exit with code 1. Case failures report the seed, case ID, category, and first differing JSON path where applicable. Participant stderr streams directly to the terminal during both successful and failing runs, so debugging output is visible as your program writes it. Session failures also report unsolicited output or unsuccessful shutdown. Use `--verbose` to inspect the failing input, then rerun with the same seed and case count.

Stdout is bounded to 32 MiB per buffered response. Stderr is inherited without buffering or truncation by the harness. On failure, the runner requests process-tree termination and releases its streams. It runs your command locally and is not a sandbox for untrusted programs.

## Examples

[examples/input.jsonl](examples/input.jsonl) and [examples/output.jsonl](examples/output.jsonl) show a three-request session.

## Verify the harness

```sh
npm run test:harness
```

The dedicated tests check literal expected results, every state pair, guaranteed input shapes, deterministic generation, large batches, and runner behavior for protocol errors, incorrect output, timeouts, and premature exits. Fixtures under `harness/tests/` are for testing the harness; do not import them into your solution.
