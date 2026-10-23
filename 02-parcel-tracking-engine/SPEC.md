# Parcel tracking protocol

Use UTF-8 JSONL: one compact JSON request per stdin line and exactly one JSON response per stdout line, including a final newline. Keep the process alive for multiple requests, process requests in order, flush each response, and exit successfully on stdin EOF. Requests are independent: never retain parcel or deduplication state between requests. Diagnostics belong on stderr. No banners, blank stdout lines, or extra responses. JSON object key order is irrelevant; array order and exact keys matter. Unknown input fields are ignored. No external services or clocks are needed.

## Request and response

A request is an object with a nonblank string `requestId` and an array `events`. A usable identifier (requestId, parcelId, eventId, facilityId) is a string containing at least one character outside U+0009 through U+000D and U+0020. These six ASCII whitespace characters alone define blankness; other characters, including U+00A0, are significant. Preserve the original string; do not trim or normalize it. Identifiers are case sensitive. String comparisons use ascending UTF-16 code units, without locale collation. Generated identifiers use ASCII and U+00A0, so code-point order and UTF-16 order agree for all generated IDs.

Every response has exactly `requestId`, `parcels`, and `errors`. A valid request echoes requestId. An invalid request returns no parcels and `errors: [{"reason":"INVALID_REQUEST"}]`; echo requestId if the input is an object with a string requestId (even blank), otherwise use null. An invalid request is a non-object, missing/invalid requestId, or non-array events. Empty events is valid. The harness sends syntactically valid JSON only; invalid JSON syntax is outside the challenge.

Each parcel record has exactly:

```json
{"parcelId":"P-1001","status":null,"currentFacility":null,"lastUpdated":null,"history":[],"anomalies":[]}
```

Initialize all three nullable fields to null; history/anomalies to empty arrays. Sort parcel records by parcelId ascending. Include every parcel identified in a retained event, even if all its payloads are invalid. Unknown input properties do not appear in output.

## Validation, deduplication, and ordering

Apply these phases in this order. Each event produces at most one error or anomaly. Duplicates produce neither.

1. Visit events in input order. Non-object events (including null and arrays) produce request-level `{index, reason: "INVALID_EVENT"}`. Index is zero based.
2. Missing/unusable eventId produces `{index, reason: "INVALID_EVENT_ID"}` at request level. Do not reserve such an ID.
3. Deduplicate globally across the request by exact eventId. Keep the first occurrence, reserving its ID even when its parcelId or payload is invalid. Ignore every later occurrence, including occurrences naming a different parcel.
4. Missing/unusable parcelId produces `{index, eventId, reason: "INVALID_PARCEL_ID"}` at request level. Do not create a parcel record for it.
5. Otherwise create the parcel record if needed. Validate payload using the following precedence. The first applicable failure produces `{eventId, reason}` in that parcel's anomalies. Exclude the event from state processing.

| Check | Reason |
| --- | --- |
| Any of timestamp, type, facilityId is absent | MISSING_FIELD |
| timestamp is not a JSON number that is an integer in [0, 9007199254740991] | INVALID_TIMESTAMP |
| type is not exactly a defined status string | INVALID_EVENT_TYPE |
| facilityId is not a usable identifier | INVALID_FACILITY_ID |

Explicit null is present but invalid. Numeric strings, fractions, negative numbers and booleans are invalid timestamps. All payload anomalies appear first, in input order per parcel. Request-level errors appear in input order. There is no placeholder parcel for an unusable identifier.

JSON numbers are compared by mathematical value: `1`, `1.0`, and `1e0` are equivalent, as are `0` and `-0`. Negative zero is a valid timestamp equal to zero. The harness sends finite JSON numbers, unique object member names, and well-formed Unicode strings. Non-standard JSON tokens (NaN, Infinity) are never inputs. Output must use valid UTF-8 and standard JSON; a UTF-8 byte-order mark is not part of the protocol.

6. Sort all retained payload-valid events by timestamp ascending, then eventId ascending. Process in this order. Append state anomalies after the payload anomalies, in processing order per parcel. A malformed timestamp is never used for sorting.

## State machine

Statuses: CREATED, PICKED_UP, IN_TRANSIT, AT_SORTING_CENTER, OUT_FOR_DELIVERY, DELIVERED, RETURNED.

| Current status | Accepted next statuses |
| --- | --- |
| null | CREATED |
| CREATED | PICKED_UP |
| PICKED_UP | IN_TRANSIT |
| IN_TRANSIT | AT_SORTING_CENTER |
| AT_SORTING_CENTER | IN_TRANSIT, OUT_FOR_DELIVERY |
| OUT_FOR_DELIVERY | DELIVERED, RETURNED |
| DELIVERED | none |
| RETURNED | none |

When status is null, any payload-valid event other than CREATED produces `MISSING_CREATED`. It leaves status null; a later valid CREATED may initialize the parcel. For any other disallowed edge, append `INVALID_TRANSITION`. This includes repeated CREATED, same-status scans with distinct event IDs, and any event after a terminal state. Payload errors take precedence over state errors.

Accepted events set status to type, currentFacility to facilityId, lastUpdated to timestamp, and append type to history. Rejected events modify none of these four fields. Sorting-center/transit loops may repeat indefinitely through the defined edges. No facility topology validation is required.

Example anomaly: `{"eventId":"e9","reason":"INVALID_TRANSITION"}`. A parcel without accepted CREATED retains null status/facility/timestamp and empty history. There is no extra parcel-level summary anomaly for missing creation; each valid premature event gets MISSING_CREATED.
