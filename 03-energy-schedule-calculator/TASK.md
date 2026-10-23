# Energy Schedule Calculator

Calculate a 24-hour residential battery schedule that minimizes electricity cost under battery, grid, and end-of-day charge constraints.

The normative participant specification, protocol, units, numerical tolerances, scoring rules, and CLI instructions are in [README.md](README.md). Read that file before implementing. Use --export-case to obtain a complete 24-hour input.

Implement your participant as a standalone executable in any language. Do not depend on harness internals. The harness validates physical behavior and cost rather than comparing actions with a single expected schedule. No participant implementation is supplied.
