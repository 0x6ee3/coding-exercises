# Fleet Event Processor protocol

## Transport and lifecycle

The harness launches one long-running subprocess in the project directory. Its stdin and stdout use UTF-8 JSON Lines: one JSON object followed by LF per line. CRLF responses are also accepted. There is no byte-order mark, blank line, banner, logging, or additional response on stdout. Whitespace within a JSON line is allowed. Use stderr for diagnostics; the harness inherits it directly.

The harness sends requests sequentially and waits for a response before sending the next. Respond promptly and flush stdout. There must be exactly one response per request, in request order. After the final response, the harness closes stdin; the participant must exit with code zero within the configured timeout. Malformed JSON, invalid UTF-8, extra output, partial lines, nonzero exit, and timeouts fail the run. The maximum response line size is 8 MiB (8,388,608 UTF-8 bytes, excluding LF but including an optional CR); generated responses are far smaller. The limit applies per line regardless of pipe buffering. Startup time counts toward the first response timeout. On failure the harness attempts to terminate the launched process tree; this runner is not a security sandbox. Participant programs must not leave background processes running.

Every JSON object in a request or response must have unique member names after JSON unescaping. Duplicate response member names are rejected rather than resolved using a language-specific first/last-member convention. Input fixtures never contain duplicate member names. JSON numbers, strings, booleans, nulls, arrays, and objects retain their distinct types.

Every request is independent. No vehicle state or duplicate ID history carries across requests.

## Request envelope

```json
{"requestId":"req-001","events":[{"eventId":"evt-001","vehicleId":"vehicle-123","timestamp":1720000000,"type":"location","latitude":52.52,"longitude":13.405}]}
```

The harness always supplies a well-formed JSON object with a nonempty string `requestId` and an array `events`. Request IDs are unique within a run and must be echoed exactly. Invalid envelopes and malformed input JSON are outside the challenge. Array entries may be arbitrary JSON values. Unknown object members are ignored, including unknown envelope members. No coercion of strings, booleans, or null to numbers is permitted.

For assessment sizing, each request contains at most 15,000 event entries and at most 1,000 distinct valid vehicle IDs. Requests are generated one at a time; increasing `--cases` increases the number of independent requests rather than their maximum size. Input numeric values use ordinary finite JSON numbers, not precision or overflow traps. Numeric comparisons and response equality use IEEE 754 binary64 values, with -0 equal to 0. A decimal-capable language can preserve an input number's decimal spelling; a binary64-capable language can use a round-trip numeric serializer. No arithmetic or coordinate conversion is required on payload values. Validation boundaries are inclusive as stated below.

## Event validation

An event must be a JSON object (not null or an array). `eventId` and `vehicleId` must each be a string of 1–128 ASCII characters from `A–Z`, `a–z`, `0–9`, underscore, or hyphen. Identifiers are case sensitive; no trimming or normalization occurs.

`timestamp` must be a JSON number representing an integer from 0 through 9007199254740991 inclusive (the interoperable safe integer range). It represents Unix seconds, with no wall-clock cutoff. Fractions and negative timestamps are invalid. JSON numeric spellings such as `1.0` or `1e3` are valid if their numeric value satisfies the rule. Negative zero equals zero.

`type` must exactly match one of the following strings. The event must supply all fields required by its type:

| Type | Required fields and valid values | Property updated |
| --- | --- | --- |
| `location` | `latitude`: finite number in [-90,90]; `longitude`: finite number in [-180,180] | `location`, as a single coordinate pair |
| `battery` | `percentage`: finite number in [0,100], fractions allowed | `battery` |
| `status` | `status`: exactly `available`, `reserved`, `driving`, `charging`, or `maintenance` | `status` |

Both coordinate boundaries are inclusive and fractional coordinates are allowed. Missing or null required fields, incorrect types, out-of-range values, unknown types, and unknown statuses invalidate the entire event. Extra fields do not invalidate an event and cannot update another property. Finite means neither NaN nor positive/negative infinity; non-finite JSON extensions are never generated.

## Duplicate handling and acceptance

Inspect entries in the original array order. An object with a valid `eventId` consumes that ID on its first occurrence, **even when the rest of that event is invalid**. Every later object with that same ID is ignored entirely. Duplicate IDs are global across vehicles and event types within the request. They are not scoped to a vehicle. Conflicting copies never replace the first copy.

Entries without a valid `eventId` consume no ID. Entries with invalid data are ignored and do not create vehicles or affect timestamps. A valid first occurrence is an accepted event. This duplicate rule is applied before any timestamp comparison; input order therefore matters for conflicting duplicates, including invalid first copies.

## State and ordering

For each vehicle with at least one accepted event:

1. Determine `location`, `battery`, and `status` independently. The accepted event with the greatest timestamp for that property supplies its value.
2. If several accepted events for that property share the greatest timestamp, choose the lexicographically greatest `eventId`.
3. A property with no accepted event is JSON `null`.
4. `lastSeen` is the maximum timestamp over all accepted events for that vehicle, regardless of which property they update. Invalid or duplicate events never contribute.

Lexicographic comparisons use ASCII code values, character by character, with a shorter prefix sorting before its extension. For example `A < Z < _ < a`, `e10 < e2`, and `e < e0`. Do not use locale-sensitive or numeric-aware sorting. The same comparison sorts vehicles by `vehicleId` ascending. Vehicles with no accepted events must be absent.

## Response schema

```json
{"requestId":"req-001","vehicles":[{"vehicleId":"vehicle-123","location":{"latitude":52.52,"longitude":13.405},"battery":null,"status":null,"lastSeen":1720000000}]}
```

The top-level object has exactly `requestId` and `vehicles`. Each vehicle has exactly `vehicleId`, `location`, `battery`, `status`, and `lastSeen`. A non-null location has exactly `latitude` and `longitude`. Battery is a number or null; status is an allowed string or null. Echo numeric values without rounding. Empty fleets produce `"vehicles":[]`.

The harness compares JSON structurally: object member ordering is irrelevant, array ordering is significant, types and nulls must match, and missing or extra fields fail. Numeric spellings compare by value, including -0 equal to 0; numbers are not compared using a tolerance. Each vehicle appears exactly once.

## Assessment result

A participant passes a run only if every fixed and randomized request produces the complete correct response and the process satisfies the transport and shutdown rules. There is no score for a correct subset of vehicles, extra responses, or merely completing the harness self-tests. The harness reports the first failure. Timing is a configurable execution limit, not a speed ranking. Assessors should use the same harness version, seed, case count, and suitably generous timeout for all participants; compiled submissions should be built before evaluation.
