# Order Processing Adapter

Draft challenge: accept unreliable order documents from a third-party supplier, repair documented inconsistencies, and forward a canonical order without damaging unrelated data.

Use a standard JSON library. Compare approaches such as typed models with extension data, JSON trees, or a combination. The exercise is about validation, normalization, and preserving data, rather than writing a JSON parser or copying every property into a new object.

Read [SPEC.md](SPEC.md) for the proposed contract, concrete repair rules, and complete examples. This folder contains a design draft only: no harness, starter solution, dependencies, or runnable commands have been added.

## What should make this fun

- Three outcomes: accepted unchanged, repaired, or rejected.
- Physical and digital orders with different requirements.
- A receipt explaining exactly which fields were repaired.
- Atomic forwarding: one bad position rejects the entire order.
- Supplier extensions and nested metadata must survive, including fields whose names resemble fields owned by the adapter.
- Correct orders need no reconstruction and receive an empty repair receipt.

## Ideas for a future harness

Generate valid canonical orders first, inject specific supplier quirks, and include independent literal examples. Exercise every repair both alone and in combination. Include conflicting failures, incorrect containers, large position arrays, and already-canonical documents.

Preservation cases should include unknown fields at every object level, nested arrays, explicit nulls, strings containing JSON-looking text, and unrelated properties named quantity, currency, or express. Compare parsed JSON values, ignoring object member order and formatting while preserving array order and string contents.

Potential comparison topics: distinguishing missing from null; numeric and string conversion; variant modeling; error accumulation; retaining unknown properties; implementation size and clarity. Performance can be a secondary measurement after correctness.

Keep the initial challenge bounded. Avoid real HTTP requests, authentication, retries, databases, full email validation, general JSON Schema implementation, and undocumented best-effort coercion. Optional later extensions could cover supplier-specific versions or batch processing, but are outside this draft.
