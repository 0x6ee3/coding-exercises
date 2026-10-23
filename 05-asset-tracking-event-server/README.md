# Asset Tracking Event Server

Implement a tracking service in any language. Consume tracker events, deduplicate and maintain per-device state, and route accepted updates to subscribed clients. This repository supplies the TCP simulator, subscribers, seeded workload, oracle and grader. **No participant implementation is included.** Place your code in the empty `participant/` directory.

Read [SPEC.md](SPEC.md) for the complete language-independent wire contract. Start your subscriber listener before connecting to the source; use the four supplied environment variables. The service must reconnect to the source without losing state.

Requires Node.js 24 or newer; runtime uses native TypeScript support and no external packages. From this directory:

```sh
npm run test:harness
npm test -- --command "node participant/main.js"
npm test -- --command "java -jar participant/app.jar" --seed 123 --devices 1000 --subscribers 16 --events 20000
npm test -- --command "go run ./participant" --stress --timeout 30000
npm install
npm run typecheck
```

The first command verifies the harness with isolated fixtures. Participant grading exits 0 for PASS, 1 for failure (including startup, protocol and timeout failures), or 2 for an inconclusive stress observation. A stress disconnect observation still requires manual queue-bound review; it does not certify memory compliance. `--help` lists options. Optional development dependencies are only needed for typechecking; use `npm ci` to install the locked versions.

| Option | Default | Meaning |
|---|---|---|
| --command | required | Trusted local shell command; working directory is this directory |
| --seed | 42 | Unsigned 32-bit workload seed |
| --devices | 500 | Generated device population; fixed probes use additional IDs |
| --subscribers | 8 | Concurrent functional clients |
| --events | 10000 | Generated workload deliveries, including duplicates |
| --rate | 0 | Target workload input events/sec; 0 sends unpaced bursts |
| --timeout | 10000 | Deadline per connection, response, barrier or write in ms |
| --source-port | 9090 | Source port; 0 requests an ephemeral port |
| --subscriber-port | 9091 | Participant listener port |
| --verbose | false | Print participant output and batch progress |
| --stress | false | Add sustained paused-reader overload suite |

Fixed probes run in addition to `--events`, including Unicode IDs, numeric boundaries, sparse states and reconnect persistence. Rate applies to generated workload batches (250 events); handshakes and grading may lower achieved throughput. The report includes acceptance/rejection counts, notification errors, state errors, per-device ordering violations, whole-run throughput and send-to-receive latency percentiles. Structured fixed probes and optional stress traffic are included in event counters; raw malformed JSON/control probes are not tracker events and are excluded. Latency includes batching and local transport. Missing messages never become latency samples. Failures retain up to 16 KB of participant output; verbose mode streams output live. Correctness is pass/fail; throughput and latency have no hidden scoring threshold. Compare candidates using the same published configuration and environment. See the assessment policy in SPEC.md.

The runner terminates the launched process tree on Windows with taskkill, or the process group on POSIX. Use a foreground executable; do not daemonize or detach child services. Ctrl+C triggers cleanup. Only execute trusted commands. The harness binds and connects exclusively to 127.0.0.1.

Examples are static scenarios, not a working solution. The grading oracle and validation logic live entirely under `harness/`.
