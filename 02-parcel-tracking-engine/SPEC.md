# Parcel tracking protocol

Use UTF-8 JSONL: one compact JSON request per stdin line and exactly one JSON response per stdout line, including a final newline. Keep the process alive for multiple requests, process requests in order, flush each response, and exit successfully on stdin EOF. Requests are independent: never retain parcel or deduplication state between requests. Diagnostics belong on stderr. No banners, blank stdout lines, or extra responses. JSON object key order is irrelevant; array order and exact output keys matter. No external services or clocks are needed.

## Guaranteed input

Every request is a JSON object with exactly these fields:

| Field | Type |
| --- | --- |
| requestId | Nonempty string |
| events | Array of event objects; may be empty |

Every event has all five fields below. The harness may include additional properties; ignore them.

| Field | Type |
| --- | --- |
| eventId | Nonempty string |
| parcelId | Nonempty string |
| timestamp | Integer from 0 through 9007199254740991 |
| type | One of the seven event statuses listed below |
| facilityId | Nonempty string |

All input fields are present, correctly typed, and non-null. The harness never sends malformed JSON, invalid request structures, malformed events, unknown event types, or invalid field values. You do not need input validation or custom JSON parsing. Use your language's standard JSON library and ordinary request/event models. The harness sends finite JSON numbers, unique object member names, and well-formed Unicode strings.

All identifiers are case sensitive ASCII strings. Preserve them exactly: do not trim, normalize, or change capitalization. Spaces are significant; even a string consisting only of spaces is nonempty. Compare identifiers in case-sensitive lexicographic order, with a shorter prefix first: `A < a`, `e < e0`, and `P-10 < P-2`. Locale-specific collation is outside the assessment.

Event statuses: CREATED, PICKED_UP, IN_TRANSIT, AT_SORTING_CENTER, OUT_FOR_DELIVERY, DELIVERED, RETURNED. NOT_CREATED is an output state only and never an event type.

## Response

Every response has exactly `requestId` and `parcels`. Echo the requestId. There is no request-level errors array. Every parcel has exactly these six fields:

| Field | Type and initial value |
| --- | --- |
| parcelId | String from the retained event |
| status | Event status or `NOT_CREATED`; initially `NOT_CREATED` |
| currentFacility | String; initially `""` |
| lastUpdated | Integer; initially `0` |
| history | Array of accepted event status strings; initially empty |
| anomalies | Array of objects with exactly eventId and reason; initially empty |

No output field is null or omitted. Include every parcel identified in a retained event, even if none of its events is accepted. Sort parcel records by parcelId ascending. The initial facility and timestamp mean that no scan has been accepted; use status NOT_CREATED to distinguish this from an accepted scan at timestamp zero. NOT_CREATED never appears in history.

## Deduplication and ordering

1. Visit events in input order. Deduplicate globally across the request by exact eventId. Keep the first occurrence and ignore every later occurrence, even if it names another parcel or has different field values. Duplicates produce no anomaly and do not create parcel records.
2. Sort retained events by timestamp ascending, then eventId ascending. Deduplication happens before sorting.
3. Process events in that order. Append each rejected event's anomaly to its parcel in processing order. An anomaly contains the eventId and either MISSING_CREATED or INVALID_TRANSITION. Each retained event produces at most one anomaly.

## State machine

| Current status | Accepted next statuses |
| --- | --- |
| NOT_CREATED | CREATED |
| CREATED | PICKED_UP |
| PICKED_UP | IN_TRANSIT |
| IN_TRANSIT | AT_SORTING_CENTER |
| AT_SORTING_CENTER | IN_TRANSIT, OUT_FOR_DELIVERY |
| OUT_FOR_DELIVERY | DELIVERED, RETURNED |
| DELIVERED | none |
| RETURNED | none |

When status is NOT_CREATED, any event other than CREATED produces MISSING_CREATED. A later CREATED may initialize the parcel. Any other disallowed edge produces INVALID_TRANSITION, including repeated CREATED, same-status scans with distinct event IDs, and events after a terminal state.

Accepted events set status to type, currentFacility to facilityId, lastUpdated to timestamp, and append type to history. Rejected events modify none of these four fields. Sorting-center/transit loops may repeat indefinitely through the defined edges. No facility topology validation is required.

A parcel without an accepted CREATED retains its initial fields and empty history. There is no extra parcel-level summary anomaly for missing creation; each premature retained event gets MISSING_CREATED.

## Complete examples

An empty batch:

```json
{"requestId":"case-empty","events":[]}
```

```json
{"requestId":"case-empty","parcels":[]}
```

A parcel with no creation:

```json
{"requestId":"case-missing","events":[{"eventId":"e9","parcelId":"P-2","timestamp":10,"type":"DELIVERED","facilityId":"F"}]}
```

```json
{"requestId":"case-missing","parcels":[{"parcelId":"P-2","status":"NOT_CREATED","currentFacility":"","lastUpdated":0,"history":[],"anomalies":[{"eventId":"e9","reason":"MISSING_CREATED"}]}]}
```

Delivery immediately after creation:

```json
{"requestId":"case-transition","events":[{"eventId":"e1","parcelId":"P-1001","timestamp":1000,"type":"CREATED","facilityId":"BER-01"},{"eventId":"e9","parcelId":"P-1001","timestamp":1100,"type":"DELIVERED","facilityId":"BER-02"}]}
```

```json
{"requestId":"case-transition","parcels":[{"parcelId":"P-1001","status":"CREATED","currentFacility":"BER-01","lastUpdated":1000,"history":["CREATED"],"anomalies":[{"eventId":"e9","reason":"INVALID_TRANSITION"}]}]}
```
