
# Build a Coding Challenge Harness: Vehicle Relocation Dispatcher

Create a standalone Node.js/TypeScript coding challenge harness.

Do NOT implement the participant's relocation algorithm.

## Scenario

A free-floating car-sharing provider needs to reposition vehicles between city zones.

Some zones have too many available vehicles, while others have too few relative to forecasted demand.

The participant must generate a relocation plan.

## Input protocol

Use JSONL over stdin/stdout.

Example:

{
  "requestId": "dispatch-001",
  "zones": [
    {
      "zoneId": "A",
      "latitude": 52.52,
      "longitude": 13.40,
      "targetVehicles": 12
    },
    {
      "zoneId": "B",
      "latitude": 52.50,
      "longitude": 13.45,
      "targetVehicles": 8
    }
  ],
  "vehicles": [
    {
      "vehicleId": "V1",
      "zoneId": "A",
      "batteryPercentage": 75,
      "status": "AVAILABLE"
    }
  ],
  "constraints": {
    "maxRelocations": 20,
    "minBatteryPercentage": 30,
    "maxRelocationDistanceKm": 15
  }
}

## Output shape

See SPEC.md for the authoritative participant contract and examples/ for a request/response pair with a valid move. This file records the harness construction brief, not additional participant requirements. For the input above, A is below its target, so an empty relocation array is valid.

{
  "requestId": "dispatch-001",
  "relocations": []
}

## Business rules

1. Only AVAILABLE vehicles may be relocated.
2. Battery level must meet the minimum.
3. A vehicle can be relocated at most once.
4. Vehicles may only be taken from zones above their target.
5. Each destination must be below its target when the move is applied.
6. Never relocate more vehicles than maxRelocations.
7. The distance between zones must not exceed maxRelocationDistanceKm.
8. Use Haversine distance between zone centers.
9. Relocations are executed in array order.
10. No vehicle may move to the same zone it already occupies.
11. All vehicle IDs and zone IDs must be valid.
12. Every relocation must preserve the source zone's target inventory.

## Scoring model

The validator computes:

Initial shortage:
sum(max(targetVehicles - availableVehicles, 0))

Final shortage:
sum(max(targetVehicles - availableVehicles, 0))

Relocation distance:
sum(distanceKm for every relocation)

Primary objective:
Reduce total shortage.

Secondary objective:
Minimize total relocation distance.

Use a documented scoring function that rewards shortage reduction and penalizes unnecessary distance.

A valid empty plan must be accepted, but should generally score poorly when useful relocations are possible.

Provide a deterministic greedy baseline algorithm inside the harness.

Optionally calculate a stronger optimization benchmark.

The participant's score should not depend on matching the baseline's exact relocation list.

## Test generation

Generate:
- Small city zones
- Dense urban areas
- Sparse rural areas
- Surplus and shortage distributions
- Low-battery vehicles
- Unavailable vehicles
- Fully balanced fleets
- Maximum relocation limits
- Impossible relocations
- Multiple equally attractive destinations
- Hundreds of zones
- Thousands of vehicles

Use deterministic random seeds.

## Validation

Validate:
- JSON structure
- Source and destination zones
- Vehicle eligibility
- Battery constraints
- Maximum distance
- No duplicate vehicle relocation
- Correct inventory changes
- Maximum number of relocations
- Source target preservation
- Resulting zone shortages

Report actionable diagnostics.

## Runner

npm run test -- --command "node participant/main.js"

Support:
--seed
--cases
--verbose
--timeout

## Deliverables

README.md
SPEC.md
harness/
examples/
participant/ (empty)
package.json

Do not write a participant solution.

Do not expose the baseline algorithm as a solution template.

Build unit tests for the harness itself and verify the scoring model on hand-calculated scenarios.
