# Parcel tracking protocol

Use UTF-8 JSONL: one compact JSON request per stdin line and exactly one JSON response per stdout line, including a final newline. Keep the process alive for multiple requests, process requests in order, flush each response, and exit successfully on stdin EOF. Requests are independent: never retain parcel or deduplication state between requests. Diagnostics belong on stderr. No banners, blank stdout lines, or extra responses. JSON object key order is irrelevant; array order and exact keys matter. Unknown input fields are ignored. No external services or clocks are needed.

## Request and response

A request is an object with a nonempty string `requestId` and an array `events`. All identifiers (requestId, parcelId, eventId, facilityId) must be nonempty strings. Preserve the original value: do not trim, normalize, or change capitalization. Identifiers are case sensitive. Spaces are significant; even a string consisting only of spaces is nonempty and must be preserved. Missing identifiers, empty strings, null, and non-string values are invalid.

Compare identifiers in case-sensitive lexicographic order, with a shorter prefix first. For example, `A < a`, `e < e0`, and `P-10 < P-2`. The harness uses ASCII identifiers; Unicode normalization and locale-specific collation are not part of the assessment.

Every response has exactly `requestId`, `parcels`, and `errors`. A valid request echoes requestId. An invalid request is a non-object, has a missing/invalid requestId, or has a missing/non-array events field. Do not process any events in an invalid request. Echo requestId if the input is an object with a string requestId (including an empty string); otherwise return null for requestId. The harness sends syntactically valid JSON only; invalid JSON syntax is outside the challenge.

For this invalid request:

```json
{"requestId": "case-invalid", "events": null}
```

The complete expected response is:

```json
{
  "requestId": "case-invalid",
  "parcels": [],
  "errors": [{"reason": "INVALID_REQUEST"}]
}
```

For an input line containing `null`, the complete expected response is:

```json
{
  "requestId": null,
  "parcels": [],
  "errors": [{"reason": "INVALID_REQUEST"}]
}
```

An empty events array is valid. For requestId `case-empty` with no events, the complete expected response is:

```json
{
  "requestId": "case-empty",
  "parcels": [],
  "errors": []
}
```

Every parcel has exactly the seven fields shown in this complete response for a single parcel before any event has been accepted:

```json
{
  "requestId": "case-validation",
  "parcels": [{
    "parcelId": "P-1001",
    "status": null,
    "currentFacility": null,
    "lastUpdated": null,
    "history": [],
    "anomalies": [{"eventId": "e1", "reason": "MISSING_FIELD"}]
  }],
  "errors": []
}
```

Initialize all three nullable fields to null; history/anomalies to empty arrays. Sort parcel records by parcelId ascending. Include every parcel identified in a retained event, even if all its payloads are invalid. Unknown input properties do not appear in output.

## Validation, deduplication, and ordering

Apply these phases in this order. Each event produces at most one error or anomaly. Duplicates produce neither.

1. Visit events in input order. Non-object events (including null and arrays) produce INVALID_EVENT in the request's errors array. Include the zero-based input index.
2. Missing/invalid eventId produces INVALID_EVENT_ID at request level. Include the input index. Do not reserve such an ID.
3. Deduplicate globally across the request by exact eventId. Keep the first occurrence, reserving its ID even when its parcelId or payload is invalid. Ignore every later occurrence, including occurrences naming a different parcel.
4. Missing/invalid parcelId produces INVALID_PARCEL_ID at request level. Include the input index and eventId. Do not create a parcel record for it.
5. Otherwise create the parcel record if needed. Validate payload using the following precedence. The first applicable failure adds an anomaly containing eventId and reason to that parcel. Exclude the event from state processing.

For each row below, start with this request and make only the change specified in the Check column. Rows are independent. Each expected response is complete; the parcel exists but has no accepted event.

```json
{
  "requestId": "case-validation",
  "events": [
    {"eventId":"e1","parcelId":"P-1001","timestamp":1000,"type":"CREATED","facilityId":"BER-01"}
  ]
}
```

| Check | Reason | Expected response |
| --- | --- | --- |
| Any of timestamp, type, facilityId is absent. Example: remove facilityId. | MISSING_FIELD | `{"requestId":"case-validation","parcels":[{"parcelId":"P-1001","status":null,"currentFacility":null,"lastUpdated":null,"history":[],"anomalies":[{"eventId":"e1","reason":"MISSING_FIELD"}]}],"errors":[]}` |
| timestamp is not a JSON number that is an integer from 0 through 9007199254740991. Example: set timestamp to the string `"1000"`. | INVALID_TIMESTAMP | `{"requestId":"case-validation","parcels":[{"parcelId":"P-1001","status":null,"currentFacility":null,"lastUpdated":null,"history":[],"anomalies":[{"eventId":"e1","reason":"INVALID_TIMESTAMP"}]}],"errors":[]}` |
| type is not exactly a defined status string. Example: set type to `"UNKNOWN"`. | INVALID_EVENT_TYPE | `{"requestId":"case-validation","parcels":[{"parcelId":"P-1001","status":null,"currentFacility":null,"lastUpdated":null,"history":[],"anomalies":[{"eventId":"e1","reason":"INVALID_EVENT_TYPE"}]}],"errors":[]}` |
| facilityId is not a nonempty string. Example: set facilityId to `""`. | INVALID_FACILITY_ID | `{"requestId":"case-validation","parcels":[{"parcelId":"P-1001","status":null,"currentFacility":null,"lastUpdated":null,"history":[],"anomalies":[{"eventId":"e1","reason":"INVALID_FACILITY_ID"}]}],"errors":[]}` |

For request-level event errors, each row below is a separate request with requestId `case-error` and exactly one event at index 0. Each expected response is complete.

| Check / example event | Reason | Expected response |
| --- | --- | --- |
| Event is not an object; example: `null` | INVALID_EVENT | `{"requestId":"case-error","parcels":[],"errors":[{"index":0,"reason":"INVALID_EVENT"}]}` |
| eventId is missing or invalid; example: `{"parcelId":"P-1001"}` | INVALID_EVENT_ID | `{"requestId":"case-error","parcels":[],"errors":[{"index":0,"reason":"INVALID_EVENT_ID"}]}` |
| parcelId is missing or invalid; example: `{"eventId":"e1"}` | INVALID_PARCEL_ID | `{"requestId":"case-error","parcels":[],"errors":[{"index":0,"eventId":"e1","reason":"INVALID_PARCEL_ID"}]}` |

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

A parcel without accepted CREATED retains null status/facility/timestamp and empty history. There is no extra parcel-level summary anomaly for missing creation; each valid premature event gets MISSING_CREATED.

For example, this request attempts delivery immediately after creation:

```json
{
  "requestId": "case-transition",
  "events": [
    {"eventId":"e1","parcelId":"P-1001","timestamp":1000,"type":"CREATED","facilityId":"BER-01"},
    {"eventId":"e9","parcelId":"P-1001","timestamp":1100,"type":"DELIVERED","facilityId":"BER-02"}
  ]
}
```

The complete expected response is:

```json
{
  "requestId": "case-transition",
  "parcels": [{
    "parcelId": "P-1001",
    "status": "CREATED",
    "currentFacility": "BER-01",
    "lastUpdated": 1000,
    "history": ["CREATED"],
    "anomalies": [{"eventId": "e9", "reason": "INVALID_TRANSITION"}]
  }],
  "errors": []
}
```
