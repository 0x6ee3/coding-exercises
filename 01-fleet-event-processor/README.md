# Fleet Event Processor

Implement a program in TypeScript or any language that reconstructs a vehicle fleet from event data. Write your program in the `participant/` directory. This challenge is intended for practice without AI-assisted implementation.

Read [SPEC.md](SPEC.md) for the event rules and input/output format. The harness supplies correctly structured events; only coordinate ranges, battery ranges, and status values may be invalid. The paired files in `examples/` show a small smoke request and its expected response.

Requirements: Node.js 24 or newer, npm, and the runtime/compiler for your chosen language. The harness uses native TypeScript support and runs without installing packages. For editor support and strict typechecking of both `harness/**/*.ts` and `participant/**/*.ts`, install the development dependencies:

```sh
npm ci
npm run typecheck
npm run test:harness
```

To evaluate your application, `npm test` defaults to `participant/main.ts`. Use `npm run test:harness` to verify the harness itself.

```sh
npm test
npm test -- --seed 42 --cases 50
npm run test -- --command "node participant/main.js"
npm run test -- --command "dotnet run --project participant"
npm run test -- --command "java -jar participant/app.jar"
npm test -- --command "node participant/main.js" --seed 42 --cases 50 --timeout 5000 --verbose
```

Run commands from this project directory. Build compiled applications first, or include startup/build time in the timeout. For `dotnet run`, direct build/startup messages to stderr or use a prebuilt binary so stdout contains only protocol responses. The command is an explicitly trusted shell command using your platform's shell; quote paths as required by that shell. Event data is sent only through stdin and is never interpreted as commands.

Without `--command`, the harness runs `participant/main.ts` with the same Node.js executable as the harness. A custom `--command` takes precedence. Native TypeScript support strips types without typechecking; syntax requiring code generation, such as enums and parameter properties, and `tsconfig.json` path aliases require a custom command with your own TypeScript runner or build step. Typechecking does not emit compiled files.

Node.js and TypeScript follow the nearest `package.json` module setting. The existing `participant/package.json` uses CommonJS, so `main.ts` can use `require` and `module.exports`, with explicit `.ts` extensions for local TypeScript dependencies. For ES module syntax, change that package's `type` to `module`, use explicit `.ts` import extensions and `import type` for type-only imports, and migrate any existing CommonJS `.js` files or rename them to `.cjs`.

Your program must remain running across requests, read one UTF-8 JSON line at a time, and flush exactly one JSON response line for each request. Each request describes a separate fleet. Send diagnostics to stderr. Exit successfully when stdin closes.

Options:

| Option | Default | Meaning |
| --- | --- | --- |
| `--command` | `node participant/main.ts` | Optional shell command that overrides the default TypeScript entry point |
| `--seed` | `12345` | Unsigned 32-bit seed, including zero |
| `--cases` | `20` | Randomized cases, 0–10000, added to the fixed suite |
| `--timeout` | `5000` | Milliseconds per response, and separately for shutdown after EOF |
| `--verbose` | false | Print each passing case |
| `--help` | false | Print usage |

The suite includes empty and partial fleets, boundary and invalid event values, duplicates and conflicting duplicates, timestamp ties, shuffled events, and streams with hundreds of vehicles and thousands of events. The same seed and case count reproduce the same suite for this harness version. A mismatch prints the request ID, differing JSON paths, and an input preview. Re-run the same command with `--verbose` to locate it. Set `--cases 0` to run only fixed cases. Failure stops the run and returns exit code 1; success returns 0. All requests must pass; there is no partial-credit scoring or speed ranking.

For harness maintenance, run `npm run test:harness` and `npm run typecheck`. Test fixtures are for testing the harness; do not import them into your solution.
