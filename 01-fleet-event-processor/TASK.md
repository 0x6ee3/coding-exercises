
# Build a Coding Challenge Harness: Fleet Event Processor

You are building a standalone coding challenge harness, NOT the participant's solution.

## Objective

Create a deterministic, language-independent black-box test system for a Fleet Event Processor.

The participant must implement a program that reconstructs the current state of a vehicle fleet from unordered event data.

The goal is to practice TypeScript or another programming language without AI-assisted implementation.

## Project structure

Create:
- README.md with participant instructions
- SPEC.md with the complete protocol specification
- harness/ containing the test runner, generators and validator
- examples/ containing input/output examples
- participant/ as an empty workspace
- package.json with commands for running tests

Use Node.js and TypeScript for the harness.

Do NOT implement the participant's application.
Do NOT generate a working solution in participant/.
A private reference reducer inside the harness is permitted solely for computing expected test results.

## Communication protocol

The participant application is a long-running subprocess communicating through stdin/stdout using JSON Lines (JSONL).

The harness starts the participant process using a configurable command.

For every input line, the participant must produce exactly one JSON response line.

Input format:

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

Supported event types:
- location: latitude, longitude
- battery: percentage (0–100)
- status: available, reserved, driving, charging, maintenance

Output format:

{
  "requestId": "req-001",
  "vehicles": [
    {
      "vehicleId": "vehicle-123",
      "location": {
        "latitude": 52.52,
        "longitude": 13.405
      },
      "battery": null,
      "status": null,
      "lastSeen": 1720000000
    }
  ]
}

## Processing rules

1. Input events may arrive in any order.
2. Duplicate eventIds must be ignored.
3. For each property, the newest valid event determines its value.
4. lastSeen is the newest timestamp among valid accepted events for that vehicle.
5. Missing properties must be null.
6. Invalid coordinates, battery values or status values must be ignored.
7. Invalid events must not contribute to lastSeen.
8. Timestamps are integer Unix seconds.
9. If multiple events update the same property at the same timestamp, the lexicographically greatest eventId wins.
10. Sort output vehicles by vehicleId ascending.
11. If duplicate eventIds contain conflicting payloads, use only the first occurrence in input order.
12. Vehicles with no valid events must not appear.

Define all validation and ordering rules precisely in SPEC.md.

## Test harness

Generate deterministic test scenarios using a configurable random seed.

Include:
- Empty datasets
- Single vehicle
- Hundreds of vehicles
- Thousands of events
- Out-of-order events
- Duplicate events
- Conflicting duplicates
- Equal timestamps
- Partial state updates
- Invalid values
- Randomized event streams

Provide a private reference implementation in harness/ that computes expected output.

Compare JSON structurally, not by property ordering.

## CLI

Support:

npm run test -- --command "node participant/main.js"
npm run test -- --command "dotnet run --project participant"
npm run test -- --command "java -jar participant/app.jar"

Also support:
--seed
--cases
--verbose
--timeout

The harness must launch the participant subprocess, send test cases, read responses and report failures.

Display useful diffs between actual and expected states.

## Important constraints

- Do not generate participant business logic.
- Do not create TODO implementations containing the algorithm.
- Do not reveal reference implementation details in the participant README.
- All business rules must be publicly specified.
- Never execute arbitrary commands from input fixtures.
- Preserve stderr for debugging; reserve stdout for JSONL responses.
- Include a small fixed smoke-test dataset.

The finished project must be runnable using npm install and npm test.

Implement the harness and verify it using a deliberately simple mock participant only in the harness test fixtures.
