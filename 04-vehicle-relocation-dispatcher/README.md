# Vehicle Relocation Dispatcher

Standalone, dependency-free Node.js/TypeScript challenge harness. Requires Node.js **22.18+** (native TypeScript stripping). No installation step is needed.

Write your own JSONL program in `participant/`, then run from this directory:

```sh
npm run test -- --command "node participant/main.js"
npm run test -- --command "node participant/main.js" --seed 42 --cases 24 --timeout 2000 --verbose
npm run test:harness
```

`participant/` is intentionally empty. No participant algorithm or solution template is included. See [SPEC.md](SPEC.md) for the contract and scoring. Static request/response data lives in `examples/`.

Options: `--seed` unsigned 32-bit integer (default 1), `--cases` 1–10000 (default 24), `--timeout` positive milliseconds per response and final process exit (default 2000), `--verbose` detailed metrics and per-zone final shortages. At least 24 cases covers every profile; subsequent groups vary their generated data. Large cases have 300 zones and 6000 vehicles.

The runner starts one process using the supplied shell command, sends one request at a time, and expects exactly one newline-terminated JSON response. Keep reading until EOF, then exit successfully. Put logs on stderr. Invalid JSON, extra output, process failures and timeouts fail the run. Responses have a 2 MiB limit; stderr diagnostics retain the last 4096 characters. On failure, process-tree termination is attempted using POSIX process groups or Windows taskkill. The command runs with your permissions; run trusted code only.

Each case reports validity, score, initial/final shortage, distance and a greedy reference score. Invalid plans count as zero in the mean and cause exit status 1. Any valid plan passes the correctness checks, regardless of its score; this does not mean it meets a hiring quality bar. Protocol failures abort the run with status 1. The baseline is internal evaluator code and is a heuristic, not an optimality claim. Participant scores do not depend on it. Do not distribute evaluator source as a participant starter kit; provide SPEC.md, the protocol instructions, and static examples only. No baseline move lists are printed.

For hiring, use the same seeds, case counts, machine and timeout for every submission, review validity separately from quality, and calibrate a quality bar before administering the assessment. A score of 100 is generally unattainable with limited relocations, ineligible vehicles or unreachable demand. Impossible cases test valid behavior, not an expectation to eliminate their shortages. The displayed mean is not an optimality percentage or a hiring recommendation. Compile compiled-language submissions before launch; the command can execute any program implementing the protocol. Flush stdout after each response; startup is included in the first response deadline. Configure a timeout suitable for the permitted languages and execution environment.

Harness tests cover hand-calculated geometry and scoring, ordered inventory rules, malformed output, every eligibility constraint, input integrity, deterministic generation across seeds, equally scored alternative plans, large cases, UTF-8/CRLF transport, and runner failures. Windows process-tree cleanup requires permission to run taskkill; a restricted environment may prevent descendant cleanup. `TASK.md` records the construction brief; SPEC.md defines the participant contract.
