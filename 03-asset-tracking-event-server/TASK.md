
# Build a Coding Challenge Harness: Asset Tracking Event Server

Create a realistic, standalone black-box coding challenge harness using Node.js and TypeScript.

This challenge is inspired by SoundCloud's Follower Maze, but models an IoT asset tracking platform.

IMPORTANT:
You are building the simulator, test clients, protocol specification and grading system.

Do NOT implement the participant's tracking service.

## Architecture

There are three components:

1. TRACKER SIMULATOR (implemented by this project)
   Generates device tracking events and sends them over TCP.

2. PARTICIPANT TRACKING SERVICE (NOT implemented by this project)
   Connects to the simulator, consumes events, maintains state and forwards relevant events to subscribers.

3. SUBSCRIBER CLIENTS (implemented by this project)
   Connect to the participant service and subscribe to tracking devices.

Architecture:

Tracker Simulator
       |
       | TCP / JSONL
       v
Participant Service
       |
       | TCP / JSONL
       v
Subscriber Clients

The participant service must be implementable in TypeScript, Java, C#, Go or another language.

## Connection model

The tracker simulator listens on a configurable TCP port, default 9090.

The participant connects to that port as a TCP client.

The participant also listens on a separate TCP port, default 9091.

The harness creates subscriber connections to the participant's port.

The harness launches the participant executable using a configurable command.

The participant receives both port numbers through environment variables:

TRACKER_SOURCE_HOST
TRACKER_SOURCE_PORT
SUBSCRIBER_HOST
SUBSCRIBER_PORT

All hosts default to 127.0.0.1.

The simulator sends a READY message once the source connection is established.

The participant must start its subscriber listener before connecting to the source.

## Protocol

Use UTF-8 JSON Lines for both TCP connections.

Each message is one JSON object terminated by \n.

TCP is a byte stream. The participant must correctly handle fragmented messages and multiple messages in one TCP read.

### Tracker events

Example:

{
  "type": "LOCATION",
  "eventId": "evt-100",
  "deviceId": "tracker-42",
  "sequence": 101,
  "timestamp": 1720000100,
  "latitude": 52.52,
  "longitude": 13.405
}

Supported events:

LOCATION
BATTERY
STATUS

LOCATION fields:
latitude, longitude

BATTERY fields:
percentage

STATUS fields:
state: ACTIVE, IDLE, OFFLINE

All events include:
eventId
deviceId
sequence
timestamp
type

sequence is monotonically increasing per device for freshly generated events, but network delivery may be out of order.

## Subscriber protocol

Subscribers connect to the participant's TCP port.

Commands:

{
  "type": "SUBSCRIBE",
  "deviceId": "tracker-42"
}

{
  "type": "UNSUBSCRIBE",
  "deviceId": "tracker-42"
}

{
  "type": "GET_STATE",
  "deviceId": "tracker-42"
}

Response types:

ACK
ERROR
STATE
EVENT

Example forwarded event:

{
  "type": "EVENT",
  "eventId": "evt-100",
  "deviceId": "tracker-42",
  "sequence": 101,
  "eventType": "LOCATION",
  "timestamp": 1720000100,
  "data": {
    "latitude": 52.52,
    "longitude": 13.405
  }
}

Specify exact formats for ACK, ERROR and STATE responses in SPEC.md.

## Processing rules

1. Deduplicate tracker events using eventId.
2. Track the highest accepted sequence number per device.
3. Ignore stale events with sequence lower than or equal to the highest accepted sequence.
4. Forward only accepted events.
5. Maintain the latest known state of each device.
6. Preserve the last known value of properties not changed by an event.
7. Subscribers receive events only for subscribed devices.
8. Multiple subscribers may subscribe to the same device.
9. Subscribers may subscribe to multiple devices.
10. Unsubscribing stops subsequent notifications.
11. Disconnecting a subscriber removes all its subscriptions.
12. GET_STATE returns the current known state of a device.
13. Unknown device IDs return a documented error.
14. Duplicate subscriptions are idempotent.
15. Malformed subscriber messages must not crash the service.
16. Every command must receive exactly one ACK, STATE or ERROR response.
17. A command becomes active when the corresponding ACK is sent.
18. Forwarded events must preserve the accepted order for each device.
19. No replay of past events occurs when a new subscription is created.

For this challenge, the highest accepted sequence is maintained per device, not per event type.

This means that out-of-order events may be discarded even when they update different properties.

## Deterministic synchronization

Create explicit startup and synchronization mechanisms so that tests do not depend on arbitrary sleeps.

Use READY and ACK handshakes.

For deterministic grading, the harness must be able to:
- Establish subscriptions before sending events
- Send a controlled event batch
- Confirm the participant has processed that batch
- Assert delivered events and state
- Continue with the next batch

Introduce a source protocol message:

{
  "type": "BARRIER",
  "barrierId": "barrier-1"
}

The participant must reply over the source connection:

{
  "type": "BARRIER_ACK",
  "barrierId": "barrier-1"
}

BARRIER_ACK means all previous tracker events have been processed and their required subscriber messages have been queued for delivery in order.

The harness may then query the resulting state and read subscriber connections until the expected messages arrive or a timeout expires.

Document precise ordering and synchronization semantics.

## Event generator

Generate realistic tracker data:

- Hundreds or thousands of devices
- GPS location changes
- Battery consumption
- Device status transitions
- Duplicate events
- Out-of-order sequences
- Unknown and malformed messages
- Different event frequencies
- Bursts of thousands of messages
- Devices temporarily going offline
- Multiple subscribers
- Subscribers connecting and disconnecting
- Frequent subscription changes

Allow configurable generation rates.

## TCP robustness testing

Test:
- Messages split across multiple TCP writes
- Multiple messages in one TCP write
- Slow subscriber clients
- Sudden subscriber disconnects
- Source disconnects
- Reconnection handling
- High event throughput
- Event-order preservation
- Duplicate event suppression

Use explicit timeouts and deterministic failure reporting.

## Backpressure

Implement a separate optional stress-test suite.

The participant must not permit unlimited memory growth when a subscriber stops reading.

Define a maximum outbound queue size of 1000 messages per subscriber.

If the participant cannot enqueue another message without exceeding this limit, it must disconnect the slow subscriber.

The normal functional test suite must not require advanced backpressure handling.

The stress suite should verify bounded behavior and disconnection under sustained overload without assuming implementation-specific buffering internals.

## Test harness

Implement:
- Real TCP tracker simulator
- Real TCP subscriber clients
- Event generator
- Expected-state tracker
- Event delivery validator
- Lifecycle and synchronization controller
- Performance measurement
- Human-readable test reports

The harness must independently calculate expected states and routed events.

Do not compare against one fixed participant implementation.

## CLI

npm run test -- --command "node participant/main.js"

Support:
--seed
--devices
--subscribers
--events
--rate
--verbose
--timeout
--stress

The runner must start and terminate the participant process safely.

Print a test summary:

- Events generated
- Events accepted
- Duplicates ignored
- Stale events ignored
- Events delivered
- Missing notifications
- Unexpected notifications
- Invalid states
- Throughput
- Latency statistics
- Test verdict

## Documentation

README.md:
Participant-facing overview and execution instructions.

SPEC.md:
Complete protocol and business rules.

ARCHITECTURE.md:
Explanation of the simulator and test architecture.

examples/:
Small, reproducible scenarios.

harness/:
Simulator, clients, generators, validators and tests.

participant/:
Empty directory for the participant implementation.

## Hard constraints

- Do not implement the participant service.
- Do not produce a reference participant implementation.
- Do not place core business logic in participant/.
- The harness can contain its own reference state model.
- Keep all hidden validation logic isolated from participant code.
- All protocol behavior must be fully documented.
- Generate reproducible tests using a seed.
- Avoid arbitrary sleeps when a handshake can establish ordering.
- Use localhost TCP connections only.
- Do not require Docker or cloud infrastructure.

Implement the complete runnable harness.

Verify that the simulator, subscriber clients, barriers, generators and validators work using isolated harness unit tests and controlled protocol fixtures.

Do not create a working participant tracking server.
