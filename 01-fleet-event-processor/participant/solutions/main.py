import json
import sys

VALID_STATUSES = {
    "available",
    "reserved",
    "driving",
    "charging",
    "maintenance",
}

def is_valid(event):
    match event["type"]:
        case "battery":
            return 0 <= event["percentage"] <= 100

        case "location":
            return (
                -90 <= event["latitude"] <= 90
                and -180 <= event["longitude"] <= 180
            )

        case "status":
            return event["status"] in VALID_STATUSES

    return False

def accepted_events(events):
    seen = set()

    for event in events:
        event_id = event["eventId"]

        if event_id in seen:
            continue

        # An invalid first occurrence still reserves its ID.
        seen.add(event_id)

        if is_valid(event):
            yield event

def empty_vehicle(vehicle_id):
    return {
        "vehicleId": vehicle_id,
        "location": None,
        "battery": None,
        "status": None,
        "lastSeen": 0,
    }

def apply_event(vehicle, event):
    match event["type"]:
        case "battery":
            vehicle["battery"] = event["percentage"]

        case "location":
            vehicle["location"] = {
                "latitude": event["latitude"],
                "longitude": event["longitude"],
            }

        case "status":
            vehicle["status"] = event["status"]

    vehicle["lastSeen"] = event["timestamp"]


def reconstruct(request):
    events = sorted(
        accepted_events(request["events"]),
        key=lambda event: (event["timestamp"], event["eventId"]),
    )

    vehicles = {}

    for event in events:
        vehicle_id = event["vehicleId"]

        if vehicle_id not in vehicles:
            vehicles[vehicle_id] = empty_vehicle(vehicle_id)

        apply_event(vehicles[vehicle_id], event)

    return {
        "requestId": request["requestId"],
        "vehicles": [
            vehicles[vehicle_id]
            for vehicle_id in sorted(vehicles)
        ],
    }


for line in sys.stdin:
    request = json.loads(line)
    response = reconstruct(request)
    print(json.dumps(response, separators=(",", ":")), flush=True)
