import Foundation

struct Coordinates: Codable {
    let latitude: Double
    let longitude: Double
}

enum Payload {
    case battery(Double)
    case location(Coordinates)
    case status(String)

    var isValid: Bool {
        switch self {
        case .battery(let percentage):
            return (0...100).contains(percentage)

        case .location(let coordinates):
            return (-90...90).contains(coordinates.latitude)
                && (-180...180).contains(coordinates.longitude)

        case .status(let status):
            return [
                "available", "reserved", "driving",
                "charging", "maintenance"
            ].contains(status)
        }
    }
}

struct VehicleEvent: Decodable {
    let eventId: String
    let vehicleId: String
    let timestamp: Int
    let payload: Payload

    private enum CodingKeys: String, CodingKey {
        case eventId, vehicleId, timestamp, type
        case percentage, latitude, longitude, status
    }

    init(from decoder: Decoder) throws {
        let values = try decoder.container(keyedBy: CodingKeys.self)

        eventId = try values.decode(String.self, forKey: .eventId)
        vehicleId = try values.decode(String.self, forKey: .vehicleId)
        timestamp = try values.decode(Int.self, forKey: .timestamp)

        switch try values.decode(String.self, forKey: .type) {
        case "battery":
            payload = .battery(
                try values.decode(Double.self, forKey: .percentage)
            )

        case "location":
            payload = .location(Coordinates(
                latitude: try values.decode(Double.self, forKey: .latitude),
                longitude: try values.decode(Double.self, forKey: .longitude)
            ))

        case "status":
            payload = .status(
                try values.decode(String.self, forKey: .status)
            )

        default:
            throw DecodingError.dataCorruptedError(
                forKey: .type,
                in: values,
                debugDescription: "Unsupported event type"
            )
        }
    }
}

struct FleetRequest: Decodable {
    let requestId: String
    let events: [VehicleEvent]
}

struct Vehicle: Encodable {
    let vehicleId: String
    var location: Coordinates? = nil
    var battery: Double? = nil
    var status: String? = nil
    var lastSeen: Int = 0

    mutating func apply(_ event: VehicleEvent) {
        switch event.payload {
        case .battery(let percentage):
            battery = percentage
        case .location(let coordinates):
            location = coordinates
        case .status(let value):
            status = value
        }

        lastSeen = event.timestamp
    }

    private enum CodingKeys: String, CodingKey {
        case vehicleId, location, battery, status, lastSeen
    }

    func encode(to encoder: Encoder) throws {
        var values = encoder.container(keyedBy: CodingKeys.self)

        try values.encode(vehicleId, forKey: .vehicleId)
        try values.encode(location, forKey: .location)
        try values.encode(battery, forKey: .battery)
        try values.encode(status, forKey: .status)
        try values.encode(lastSeen, forKey: .lastSeen)
    }
}

struct FleetResponse: Encodable {
    let requestId: String
    let vehicles: [Vehicle]
}

func reconstruct(_ request: FleetRequest) -> FleetResponse {
    var seen = Set<String>()

    let events = request.events
        .filter { seen.insert($0.eventId).inserted }
        .filter { $0.payload.isValid }
        .sorted {
            if $0.timestamp != $1.timestamp {
                return $0.timestamp < $1.timestamp
            }
            return $0.eventId < $1.eventId
        }

    var vehicles: [String: Vehicle] = [:]

    for event in events {
        vehicles[
            event.vehicleId,
            default: Vehicle(vehicleId: event.vehicleId)
        ].apply(event)
    }

    return FleetResponse(
        requestId: request.requestId,
        vehicles: vehicles.values.sorted {
            $0.vehicleId < $1.vehicleId
        }
    )
}

let decoder = JSONDecoder()
let encoder = JSONEncoder()

while let line = readLine() {
    let request = try decoder.decode(
        FleetRequest.self,
        from: Data(line.utf8)
    )

    var output = try encoder.encode(reconstruct(request))
    output.append(0x0A)
    FileHandle.standardOutput.write(output)
}