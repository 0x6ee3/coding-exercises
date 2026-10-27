using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Text.Json.Serialization;

var jsonContext = new FleetJsonContext(new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    // The wire format permits the "type" discriminator anywhere in an event.
    AllowOutOfOrderMetadataProperties = true
});

while (Console.ReadLine() is { } line)
{
    FleetRequest request = JsonSerializer.Deserialize(line, jsonContext.FleetRequest)!;
    var seen = new HashSet<string>(StringComparer.Ordinal);
    var vehicles = new SortedDictionary<string, VehicleState>(StringComparer.Ordinal);

    // Deduplicate in arrival order, before validation or chronological sorting.
    // Even an invalid first occurrence reserves its ID for this request.
    var events = request.Events
        .Where(entry => seen.Add(entry.EventId))
        .Where(IsValid)
        .OrderBy(entry => entry.Timestamp)
        .ThenBy(entry => entry.EventId, StringComparer.Ordinal);

    // Replay from oldest to newest. Each assignment replaces only its own
    // property, so the last assignment also resolves equal-timestamp ties.
    foreach (var entry in events)
    {
        var vehicleId = entry.VehicleId;
        if (!vehicles.TryGetValue(vehicleId, out var vehicle))
        {
            vehicle = new VehicleState(vehicleId);
            vehicles.Add(vehicleId, vehicle);
        }

        switch (entry)
        {
            case BatteryEvent battery:
                vehicle.Battery = battery.Percentage;
                break;
            case LocationEvent location:
                vehicle.Location = new Coordinates(location.Latitude, location.Longitude);
                break;
            case StatusEvent status:
                vehicle.Status = status.Status;
                break;
        }

        vehicle.LastSeen = entry.Timestamp;
    }

    var response = new FleetResponse(request.RequestId, vehicles.Values);
    Console.WriteLine(JsonSerializer.Serialize(response, jsonContext.FleetResponse));
    Console.Out.Flush();
}

static bool IsValid(VehicleEvent entry) => entry switch
{
    BatteryEvent battery => battery.Percentage is >= 0 and <= 100,
    LocationEvent location => location.Latitude is >= -90 and <= 90
        && location.Longitude is >= -180 and <= 180,
    StatusEvent status => status.Status is
        "available" or "reserved" or "driving" or "charging" or "maintenance",
    _ => false
};

record FleetRequest(string RequestId, VehicleEvent[] Events);

[JsonPolymorphic(TypeDiscriminatorPropertyName = "type")]
[JsonDerivedType(typeof(BatteryEvent), "battery")]
[JsonDerivedType(typeof(LocationEvent), "location")]
[JsonDerivedType(typeof(StatusEvent), "status")]
abstract record VehicleEvent(string EventId, string VehicleId, int Timestamp);

sealed record BatteryEvent(string EventId, string VehicleId, int Timestamp, double Percentage)
    : VehicleEvent(EventId, VehicleId, Timestamp);

sealed record LocationEvent(string EventId, string VehicleId, int Timestamp, double Latitude, double Longitude)
    : VehicleEvent(EventId, VehicleId, Timestamp);

sealed record StatusEvent(string EventId, string VehicleId, int Timestamp, string Status)
    : VehicleEvent(EventId, VehicleId, Timestamp);

record Coordinates(double Latitude, double Longitude);
record FleetResponse(string RequestId, IEnumerable<VehicleState> Vehicles);

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(FleetRequest))]
[JsonSerializable(typeof(FleetResponse))]
partial class FleetJsonContext : JsonSerializerContext;

sealed class VehicleState(string vehicleId)
{
    public string VehicleId { get; } = vehicleId;
    public Coordinates? Location { get; set; }
    public double? Battery { get; set; }
    public string? Status { get; set; }
    public int LastSeen { get; set; }
}
