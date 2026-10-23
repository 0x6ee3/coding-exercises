
# Build a Coding Challenge Harness: Parcel Tracking Engine

Create a standalone black-box coding challenge harness in Node.js/TypeScript.

Do NOT implement the participant's solution.

## Scenario

A logistics company receives parcel scan events from warehouses, sorting facilities and delivery vehicles.

The participant must implement a parcel tracking engine that reconstructs parcel states, validates transitions and reports anomalies.

## Communication

Use a language-independent JSONL stdin/stdout protocol.

One request line contains a batch of parcel events.

Example input:

{
  "requestId": "case-001",
  "events": [
    {
      "eventId": "e1",
      "parcelId": "P-1001",
      "timestamp": 1000,
      "type": "CREATED",
      "facilityId": "BER-01"
    },
    {
      "eventId": "e2",
      "parcelId": "P-1001",
      "timestamp": 1100,
      "type": "PICKED_UP",
      "facilityId": "BER-01"
    }
  ]
}

Expected output shape:

{
  "requestId": "case-001",
  "parcels": [
    {
      "parcelId": "P-1001",
      "status": "PICKED_UP",
      "currentFacility": "BER-01",
      "lastUpdated": 1100,
      "history": ["CREATED", "PICKED_UP"],
      "anomalies": []
    }
  ]
}

## State machine

Define the following statuses:

CREATED
PICKED_UP
IN_TRANSIT
AT_SORTING_CENTER
OUT_FOR_DELIVERY
DELIVERED
RETURNED

Allowed transitions:

CREATED -> PICKED_UP
PICKED_UP -> IN_TRANSIT
IN_TRANSIT -> AT_SORTING_CENTER
AT_SORTING_CENTER -> IN_TRANSIT
AT_SORTING_CENTER -> OUT_FOR_DELIVERY
OUT_FOR_DELIVERY -> DELIVERED
OUT_FOR_DELIVERY -> RETURNED

DELIVERED and RETURNED are terminal states.

Repeated IN_TRANSIT / AT_SORTING_CENTER cycles are permitted.

## Business rules

1. Process events in ascending timestamp order, regardless of arrival order.
2. Break timestamp ties using eventId ascending.
3. Deduplicate events by eventId, keeping the first occurrence in input order.
4. Every parcel must begin with CREATED.
5. Invalid transitions must not modify the current status.
6. Record invalid transitions as anomalies.
7. A parcel without a valid CREATED event must have null status.
8. Invalid event types, missing fields and malformed timestamps must be handled explicitly.
9. History contains only accepted state transitions.
10. currentFacility refers to the facility of the most recent accepted event.
11. lastUpdated refers to the timestamp of the most recent accepted event.
12. Output parcel records are sorted by parcelId ascending.

Anomaly format:

{
  "eventId": "e9",
  "reason": "INVALID_TRANSITION"
}

Define additional precise anomaly reason codes for missing CREATED events and invalid event payloads.

Specify how malformed events without usable parcelId or eventId are reported (for example, in a request-level errors array). Do not silently ignore unspecified cases.

Ensure all business rules are deterministic and well documented.

## Test generation

Build a scenario generator that produces:

- Normal successful deliveries
- Parcels passing through multiple facilities
- Multiple sorting-center loops
- Out-of-order scan arrival
- Duplicate scans
- Invalid transitions
- Missing CREATED events
- Events after delivery
- Thousands of parcels
- Multiple simultaneous shipments
- Malformed events

All generated scenarios must be reproducible with a seed.

## Validation

Implement a private reference state machine inside the harness.

Validate:
- Final parcel statuses
- Accepted history
- Facility tracking
- Event ordering
- Anomaly reporting
- Deduplication behavior

Provide useful failure diagnostics.

## Runner

npm run test -- --command "node participant/main.js"

Support:
--seed
--cases
--verbose
--timeout

Allow any participant language as long as it implements the JSONL protocol.

## Deliverables

README.md
SPEC.md
examples/
harness/
participant/ (empty)
package.json

The reference implementation must not be placed in participant/.

Implement the harness and verify its correctness using dedicated harness tests.

The participant must write all state-processing logic independently.
