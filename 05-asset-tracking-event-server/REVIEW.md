# Assessment review

The review covers the harness and protocol; no participant implementation or example solution was added.

Corrected grading risks:

* Finite stress traffic cannot prove a transport-independent queue overflow. No disconnect now yields INCONCLUSIVE rather than an unfair failure or pass. The full 1000-message requirement remains, explicitly including unbounded user-space runtime buffers; manual review is required to certify it.
* Disconnecting all subscribers could previously satisfy the stress check. The test now verifies warmup delivery and checks every overload event on a healthy subscriber for the same device. FIN and RST are both accepted for the overloaded socket, including a truncated final write.
* Final-state-only checks could hide lost state during reconnect or intermediate property loss. Sparse, intermediate and immediate post-reconnect checks now precede later updates. Deduplication persistence is tested with a reused ID carrying a higher sequence, which sequence filtering alone cannot reject.
* JSON numeric comparison previously inherited JavaScript's distinction between negative zero and zero. Comparisons now follow JSON value semantics while retaining exact shapes and types.
* The UTF-8 fixture previously depended on TCP delivering separate writes and did not force a multibyte split. Decoder tests now cover every byte boundary, invalid UTF-8, oversized and partial frames. Fragmented source writes split inside Unicode identifiers too.
* Startup and reconnect waits now wake on child exit or cancellation; rate pacing is abortable. Interrupted/partial runs cannot produce a passing verdict.
* Protocol ambiguities are resolved for wire order, cross-device ID reuse, malformed command precedence, sparse state, backwards timestamps, unsubscribe ordering, JSON representation, extra input fields, and oversized/invalid encoding behavior.
* Coverage now includes pipelined malformed/valid commands, CRLF, Unicode IDs, numeric limits, sparse states, cross-device duplicates, and valid retries after invalid events. Fixed probes are documented separately from the generated device population.

Performance is descriptive rather than a hidden score. All correctness errors fail; counters are diagnostics rather than a weighted score that could reward extra or missing events. The specification states externally observable behavior without prescribing data structures. The internal oracle remains isolated under harness/ and contains no participant service.

Readiness: the functional challenge is ready for independent implementation against SPEC.md. Harness checks exercise isolated models, validators, framing and socket/process fixtures; they do not certify a real participant's end-to-end behavior. Optional stress results require careful interpretation and manual queue accounting review. Before using the challenge for hiring, publish the exact run configuration and provide candidates comparable local resources.
