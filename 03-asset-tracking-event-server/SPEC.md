# Asset tracking protocol v1

All connections are TCP on IPv4 loopback, UTF-8 JSON Lines. Each line is one object followed by LF (CRLF accepted). Maximum line size is 65,536 UTF-8 bytes excluding LF, including any CR. Senders must support fragmented UTF-8 characters, arbitrary read boundaries and coalesced lines. Empty lines are malformed JSON. Property order is immaterial. Responses contain exactly the documented fields. Unknown extra input properties are ignored. Identifiers are nonempty strings, compared exactly without Unicode normalization or case folding; whitespace-only identifiers are valid. JSON numeric values are compared by value: 1 and 1.0, or 0 and -0, are equivalent. Strings and numbers are distinct. Numbers are finite JSON numbers; sequences and timestamps are safe integers (at most 2^53−1). Responses must round-trip source numeric values without rounding them. Duplicate JSON object keys, invalid UTF-8 input and a UTF-8 BOM are outside the generated input contract; implementations may close those connections. Participant output must be valid UTF-8. An unterminated final line is not a complete message.

The harness listens on TRACKER_SOURCE_HOST:TRACKER_SOURCE_PORT (127.0.0.1:9090 by default). The participant listens on SUBSCRIBER_HOST:SUBSCRIBER_PORT (127.0.0.1:9091) **before** connecting to the source. These four environment variables are set by the runner. No outbound connections outside localhost are needed. One source connection is active at a time.

The source sends `{"type":"READY","protocolVersion":1}` on every connection. No READY reply is required. The participant reconnects after a source disconnect within the configured timeout, preserving all device state, deduplication history and live subscriptions. A disconnect never resets state. Subscriber reconnections are independent new sessions with no subscriptions. A participant process restart is outside this challenge.

## Source events

Every event contains `type`, `eventId`, `deviceId`, `sequence` (integer ≥1), `timestamp` (Unix seconds, integer ≥0), and the fields for its type:

| type | Fields |
|---|---|
| LOCATION | latitude in [-90,90], longitude in [-180,180] |
| BATTERY | percentage in [0,100], fractional values allowed |
| STATUS | state: ACTIVE, IDLE or OFFLINE |

Example: `{"type":"LOCATION","eventId":"e1","deviceId":"tracker-0","sequence":1,"timestamp":1720000000,"latitude":52.52,"longitude":13.405}`

Invalid JSON, nonobjects, invalid fields and unknown source types are ignored without replies or state changes; continue parsing subsequent lines. An oversized source line may terminate that connection. Valid event IDs are globally deduplicated across devices, including valid stale events. Once a valid ID has been observed, any later valid event with that ID is a duplicate even if its device, sequence or payload differs. Deduplication lasts for the whole run, including source reconnects. An invalid event does not reserve its ID.

Process events for each device in source wire order, without sorting or waiting for sequence gaps. Accept an event only when its sequence exceeds the highest accepted sequence, regardless of type. First valid events are accepted. Duplicate and stale events cause no state updates and no notifications. Timestamp does not determine acceptance and may decrease even when sequence increases. Accepted events update sequence, timestamp and only their own properties, retaining other known values. OFFLINE is a state value; it does not suppress later events. A duplicate's sequence does not advance the target device's highest accepted sequence. Cross-device reuse of IDs follows source wire order too.

Each accepted event generates exactly one notification per currently subscribed connection:

`{"type":"EVENT","eventId":"e1","deviceId":"tracker-0","sequence":1,"eventType":"LOCATION","timestamp":1720000000,"data":{"latitude":52.52,"longitude":13.405}}`

BATTERY data is `{"percentage":80}`; STATUS data is `{"state":"IDLE"}`. Data contains only the properties of that event type. Preserve accepted event order per device. Different devices may interleave freely.

## Subscriber commands

Commands have `type` (SUBSCRIBE, UNSUBSCRIBE or GET_STATE) and `deviceId`.

* SUBSCRIBE: add a device subscription; repeated subscriptions are idempotent. Device existence is not required. Never replay previous events.
* UNSUBSCRIBE: remove a subscription; absence is still successful.
* GET_STATE: return known state; subscription is not required.

Successful subscription changes return `{"type":"ACK","command":"SUBSCRIBE","deviceId":"tracker-0"}` (or UNSUBSCRIBE). They become active atomically when that ACK is queued on the subscriber stream; it need not have reached the remote client yet. Apply commands in wire order. Notifications selected before an unsubscribe ACK must precede it on that stream. Events accepted after it produce no notifications until a subsequent SUBSCRIBE ACK. Events and commands arriving on different connections may be interleaved in either order unless a documented handshake establishes causality. A disconnected subscriber's subscriptions are removed; the harness does not require the participant to detect a remote disconnect before TCP reports it.

Known state response: `{"type":"STATE","deviceId":"tracker-0","sequence":3,"timestamp":1720000003,"data":{"latitude":52.52,"longitude":13.405,"percentage":80}}`. Omit properties never observed; no null placeholders. Include no eventId or eventType.

Errors have exactly `type`, `command`, `deviceId`, `code`. Example: `{"type":"ERROR","command":"GET_STATE","deviceId":"missing","code":"UNKNOWN_DEVICE"}`.

| Condition (first matching rule) | code | command / deviceId |
|---|---|---|
| Invalid JSON | INVALID_JSON | null / null |
| Nonobject, missing/nonstring/empty type | INVALID_COMMAND | null / valid nonempty deviceId if input is an object, otherwise null |
| Unknown nonempty string type | UNKNOWN_COMMAND | supplied type / valid deviceId or null |
| Recognized command with invalid/missing deviceId | INVALID_COMMAND | supplied type / null |
| GET_STATE for device with no accepted events | UNKNOWN_DEVICE | GET_STATE / supplied deviceId |

Exactly one ACK, STATE or ERROR must be returned per complete input line. Errors do not disconnect clients or change subscriptions. Oversized subscriber lines may be disconnected without a response. No unsolicited messages, greetings, or error descriptions are allowed on subscriber streams.

## Ordering and barriers

Source message `{"type":"BARRIER","barrierId":"b1"}` requires exactly `{"type":"BARRIER_ACK","barrierId":"b1"}` on the source stream. IDs are nonempty strings; malformed barriers follow the invalid-source rule. Barriers are processed in source wire order. ACK means every preceding event has finished processing and its notifications have been placed in the appropriate subscriber outbound queues. A barrier must not wait for subscribers to read those queues.

Each subscriber has one ordered outbound stream shared by notifications and command responses. A GET_STATE response must be queued after all notifications already queued for that connection when the command is processed. After receiving BARRIER_ACK, the harness sends GET_STATE on each subscriber. Reading its response therefore fences earlier notifications, including unexpected ones, without a quiet-period sleep. Command replies preserve command input order. State is a snapshot at command processing time. Every write must respect TCP backpressure.

## Optional stress contract

Functional grading does not require the stress policy. In stress mode, bound each subscriber's outbound backlog to 1000 messages. This includes messages retained in application queues and user-space runtime/transport buffers that have not been fully handed to the OS. Moving messages to another unbounded user-space buffer does not satisfy the bound. OS socket buffers are excluded. Disconnect if accepting another outbound message would exceed the bound. Disconnect may use FIN or RST; a final partially written message is permitted on this deliberately overloaded connection. Unrelated healthy subscribers must remain connected and receive all their accepted events. Do not disconnect a subscriber merely because it has subscriptions or because a fixed total count has been reached.

The stress test first verifies low-volume delivery, then pauses one subscriber and sends 200,000 accepted events, checking barriers and all notifications on a healthy subscriber for the same device during overload. After resuming the paused socket, it waits for closure within the configured timeout. A closure is reported as DISCONNECT OBSERVED, not proof of queue-size or memory compliance. If no closure is observed, saturation of platform-specific socket buffers has not been established: report INCONCLUSIVE (exit 2), never a passing stress result or an automatic failure. Protocol errors, loss on the healthy client, unresponsiveness or corrupt complete output still fail (exit 1). Code review of queue accounting is required to certify the exact bound regardless of the observation. This keeps the full queue requirement while avoiding an impossible inference from finite TCP traffic. Functional and stress traffic are included in total counters when --stress is used; pacing applies only to the generated functional workload.

## Assessment policy

Correctness is mandatory: no missing, extra, corrupted or out-of-order per-device notifications; no incorrect state or command response; no unexpected disconnects, process exits or expired operation deadlines. Any such failure yields exit 1. The harness checks protocol output only, not source-language choices or internal data structures. Performance and latency are descriptive, with no undisclosed speed threshold beyond the configured deadlines. Use the same seed, configuration and suitably provisioned local environment for candidates being compared. Publish the chosen timeout and stress policy with the assessment. Test counters may overlap (a corrupt notification can count as both missing and unexpected); they are diagnostics, not weighted partial-credit scores. A partial or interrupted run cannot pass. Fixed edge probes are additional to --devices and --events. Stress observations and manual queue-bound review must be assessed separately from the functional verdict.
