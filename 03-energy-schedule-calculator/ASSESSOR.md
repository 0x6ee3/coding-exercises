# Organizer notes — do not include in the candidate brief

The candidate-facing contract is README.md; TASK.md is its entry point. Distribute those plus an exported input if candidates do not need to run the harness. Benchmark source and these notes belong to assessment infrastructure.

The internal benchmark is a shortest-path dynamic program over 24 layers. States are 101 uniformly spaced SoC values including both bounds plus the exact initial SoC. Transitions represent a single AC charge/discharge/idle action and are filtered using strict rate and grid constraints. Terminal SoC must be at least initial SoC. This is exact on that finite state set and approximate for continuous actions; it has no certified approximation error. Including initial SoC preserves the feasible idle path. Distinct continuous schedules can receive full credit, including schedules beating this benchmark.

Scores measure improvement against an approximate target, not proof of optimality. Inspect validity separately from score; transport or physical failures always earn zero. A no-improvement benchmark case awards full credit for a valid baseline-equivalent cost, so use the full scenario suite and review the per-case benchmark gaps rather than interpreting validity or process exit status as a hiring recommendation.

Use an identical suite, generator version, and lockfile for all candidates. Keep runtime startup costs out of algorithm comparisons by choosing a generous runtime-appropriate deadline, and precompile ahead of assessment. This harness executes trusted local commands; it is not a sandbox for untrusted candidate code.

Regression tests cover independent hand calculations, generated-input invariants, physical boundaries, scoring guards, benchmark edge cases, output chunking, nonzero exits, malformed and oversized output, and timeouts. No candidate scheduler or example solution is included.
