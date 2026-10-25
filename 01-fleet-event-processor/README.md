# Fleet Event Processor

Implement a program in TypeScript or any language that reconstructs a vehicle fleet from event data. Write your program in the empty `participant/` directory. This challenge is intended for practice without AI-assisted implementation.

Read [SPEC.md](SPEC.md) for the event rules and input/output format. The harness supplies correctly structured events; only coordinate ranges, battery ranges, and status values may be invalid. The paired files in `examples/` show a small smoke request and its expected response.

Requirements: Node.js 22 or newer, npm, and the runtime/compiler for your chosen language.

```sh
npm install
npm test
```

With no command, `npm test` runs the harness's own verification suite; passing it does **not** mean you have solved the challenge. To evaluate your application:

```sh
npm run test -- --command "node participant/main.js"
npm run test -- --command "dotnet run --project participant"
npm run test -- --command "java -jar participant/app.jar"
npm test -- --command "node participant/main.js" --seed 42 --cases 50 --timeout 5000 --verbose
```

Run commands from this project directory. Build compiled applications first, or include startup/build time in the timeout. For `dotnet run`, direct build/startup messages to stderr or use a prebuilt binary so stdout contains only protocol responses. The command is an explicitly trusted shell command using your platform's shell; quote paths as required by that shell. Event data is sent only through stdin and is never interpreted as commands.

Your program must remain running across requests, read one UTF-8 JSON line at a time, and flush exactly one JSON response line for each request. Each request describes a separate fleet. Send diagnostics to stderr. Exit successfully when stdin closes.

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--command` | none | Participant launch command; omission runs harness self-tests |
| `--seed` | `12345` | Unsigned 32-bit seed, including zero |
| `--cases` | `20` | Randomized cases, 0–10000, added to the fixed suite |
| `--timeout` | `5000` | Milliseconds per response, and separately for shutdown after EOF |
| `--verbose` | false | Print each passing case |
| `--help` | false | Print usage |

The suite includes empty and partial fleets, boundary and invalid event values, duplicates and conflicting duplicates, timestamp ties, shuffled events, and streams with hundreds of vehicles and thousands of events. The same seed and case count reproduce the same suite for this harness version. A mismatch prints the request ID, differing JSON paths, and an input preview. Re-run the same command with `--verbose` to locate it. Set `--cases 0` to run only fixed cases. Failure stops the run and returns exit code 1; success returns 0. All requests must pass; there is no partial-credit scoring or speed ranking.

For harness maintenance, run `npm run test:harness` and `npm run typecheck`. Test fixtures contain only a deliberately limited mock, which cannot solve nonempty fleet requests.
