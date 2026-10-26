using System;
using System.Diagnostics;
using System.Text.Json;
using System.Text.Json.Serialization;

var jsonContext = new ParcelJsonContext(new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    AllowOutOfOrderMetadataProperties = true
});

while (Console.ReadLine() is {} line)
{
    var req = JsonSerializer.Deserialize(line, jsonContext.ParcelRequest);
    if (req == null)
    {
        Console.Error.WriteLine($"failed to deserialize line: {line}");
        continue;
    }
    Console.Error.WriteLine($"request {req.RequestId}");

    var seen = new HashSet<string>(StringComparer.Ordinal);
    var events = req.Events
        .Where(entry => seen.Add(entry.EventId))
        .OrderBy(e => e.Timestamp).ThenBy(e => e.EventId);
    
    var parcels = new Dictionary<string, Parcel>();
    foreach (var e in events) {
        // Process events in that order.
        // Append each rejected event's anomaly to its parcel in processing order.
        // An anomaly contains the eventId and either MISSING_CREATED or INVALID_TRANSITION.
        // Each retained event produces at most one anomaly.
        if (!parcels.TryGetValue(e.ParcelId, out var p))
        {
            p = new Parcel(e.ParcelId);
            parcels.Add(e.ParcelId, p);
        }

        if (validStateTransition(p.Status, e.Type))
        {
            p.Status = e.Type;
            p.CurrentFacility = e.FacilityId;
            p.LastUpdated = e.Timestamp;
            p.History.Add(e.Type);
        }
        else
        {
            p.Anomalies.Add(new Anomaly(e.EventId, p.Status == "NOT_CREATED" ? "MISSING_CREATED" : "INVALID_TRANSITION"));
        }
    }

    var res = new ParcelResponse(req.RequestId, parcels.Values.OrderBy(p => p.ParcelId, StringComparer.Ordinal).ToList());
    Console.WriteLine(JsonSerializer.Serialize(res, jsonContext.ParcelResponse));
}

bool validStateTransition(string parcelState, string targetState) => (parcelState, targetState) switch {
    ("NOT_CREATED", "CREATED") => true,
    ("CREATED", "PICKED_UP") => true,
    ("PICKED_UP", "IN_TRANSIT") => true,
    ("IN_TRANSIT", "AT_SORTING_CENTER") => true,
    ("AT_SORTING_CENTER", "IN_TRANSIT") => true,
    ("AT_SORTING_CENTER", "OUT_FOR_DELIVERY") => true,
    ("OUT_FOR_DELIVERY", "DELIVERED") => true,
    ("OUT_FOR_DELIVERY", "RETURNED") => true,
    _ => false
};

[JsonSourceGenerationOptions(PropertyNamingPolicy = JsonKnownNamingPolicy.CamelCase)]
[JsonSerializable(typeof(ParcelRequest))]
[JsonSerializable(typeof(ParcelResponse))]
partial class ParcelJsonContext : JsonSerializerContext;

record ParcelRequest(string RequestId, List<ParcelEvent> Events);

record ParcelEvent(string EventId, string ParcelId, long Timestamp, string Type, string FacilityId);

record ParcelResponse(string RequestId, List<Parcel> Parcels);

class Parcel {
    public Parcel(string parcelId)
    {
        ParcelId = parcelId;
    }

    public string ParcelId { get; set; }

    public string Status { get; set; } = "NOT_CREATED";

    public string CurrentFacility { get; set; } = "";

    public long LastUpdated { get; set; } = 0;

    public List<string> History { get; set; } = new List<string>();

    public List<Anomaly> Anomalies { get; set; } = new List<Anomaly>();
}

record Anomaly(string EventId, string Reason);
