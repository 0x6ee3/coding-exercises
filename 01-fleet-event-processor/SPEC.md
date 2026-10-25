# Fleet Event Processor

Reconstruct the current state of a vehicle fleet from an unordered list of events. Each request is a separate dataset: neither vehicle state nor duplicate history carries over to the next request.

## Input

```json
{
  "requestId": "req-001",
  "events": [
    {
      "eventId": "evt-001",
      "vehicleId": "vehicle-123",
      "timestamp": 1720000000,
      "type": "location",
      "latitude": 52.52,
      "longitude": 13.405
    }
  ]
}
```

You may assume that input JSON and event structure are correct. Every event has string IDs, an integer Unix timestamp, a supported `type`, and all fields required by that type with the correct JSON types. Numbers are finite; timestamps are nonnegative and fit a signed 32-bit integer. IDs are nonempty strings containing only ASCII letters, digits, hyphens and underscores. You do not need to validate these guarantees or handle malformed JSON, missing fields, or incorrect field types.

Only the event values below may be invalid:

| Event type | Fields | Valid values |
| --- | --- | --- |
| `location` | `latitude`, `longitude` (numbers) | Latitude from -90 to 90; longitude from -180 to 180 |
| `battery` | `percentage` (number) | From 0 to 100 |
| `status` | `status` (string) | `available`, `reserved`, `driving`, `charging`, `maintenance` |

Numeric ranges include their endpoints; fractional coordinates and battery percentages are allowed. Status strings are case sensitive. An event updates only the property indicated by its `type`; ignore any extra fields.

## Event rules

1. Events can arrive in any order.
2. For each `eventId`, only its **first occurrence in the input array** counts. Ignore later occurrences even if their payload, vehicle, type, or timestamp differs. IDs are deduplicated across the entire request, not per vehicle.
3. If that first occurrence has an invalid value, ignore the event entirely. Its ID still counts as seen: a later valid copy cannot replace it. Invalid events do not create vehicles or contribute to `lastSeen`.
4. Determine each vehicle's location, battery, and status independently. The newest valid, nonduplicate event for that property supplies its value.
5. When events for the same property share a timestamp, the lexicographically greatest `eventId` wins.
6. A property's value is `null` if no valid, nonduplicate event supplies it. Location is a single coordinate pair, not two independent properties.
7. `lastSeen` is the greatest timestamp among all valid, nonduplicate events for the vehicle.
8. Include only vehicles with at least one valid, nonduplicate event. Return each vehicle once, sorted by `vehicleId` ascending.

Both ID comparisons use case-sensitive ASCII lexicographic order, with a shorter prefix first. For example, `A < a`, `e < e0`, and `vehicle-10 < vehicle-2`.

## Output

```json
{
  "requestId": "req-001",
  "vehicles": [
    {
      "vehicleId": "vehicle-123",
      "location": { "latitude": 52.52, "longitude": 13.405 },
      "battery": null,
      "status": null,
      "lastSeen": 1720000000
    }
  ]
}
```

Echo `requestId` and return exactly the fields shown. Preserve event values without rounding. An empty fleet is `"vehicles": []`. Object field order does not matter; vehicle array order does. See `examples/` for a request combining several event rules and its expected output.

## Running your program

Keep your program running and read one JSON request per line from stdin. Write and flush exactly one JSON response line per request on stdout. Use your language's normal JSON parser and serializer. Send debugging output to stderr, and exit successfully when stdin closes. The harness supplies valid input; no custom JSON or numeric parser is required. See README.md for commands and timeout settings.
