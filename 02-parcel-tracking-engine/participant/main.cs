using System;
using System.Text.Json;
using System.Text.Json.Serialization;

var jsonContext = new ParcelJsonContext(new JsonSerializerOptions
{
    PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
    AllowOutOfOrderMetadataProperties = true
});

while (Console.ReadLine() is { } line)
{
    var request = JsonSerializer.Deserialize(line, jsonContext.ParcelRequest);
    if (request == null)
    {
        Console.Error.WriteLine($"failed to deserialize line: {line}");
        continue;
    }
    Console.Error.WriteLine($"request {request.RequestId}");

    var events = request.Events
        .DistinctBy(e => e.EventId, StringComparer.Ordinal)
        .OrderBy(e => e.Timestamp)
        .ThenBy(e => e.EventId, StringComparer.Ordinal);
    
    var parcels = new Dictionary<string, Parcel>();
    foreach (var @event in events)
    {
        if (!parcels.TryGetValue(@event.ParcelId, out var parcel))
        {
            parcel = new Parcel(@event.ParcelId);
            parcels.Add(@event.ParcelId, parcel);
        }

        if (IsValidStateTransition(parcel.Status, @event.Type))
        {
            parcel.Status = @event.Type;
            parcel.CurrentFacility = @event.FacilityId;
            parcel.LastUpdated = @event.Timestamp;
            parcel.History.Add(@event.Type);
        }
        else
        {
            parcel.Anomalies.Add(new Anomaly(@event.EventId, parcel.Status == "NOT_CREATED" ? "MISSING_CREATED" : "INVALID_TRANSITION"));
        }
    }

    var res = new ParcelResponse(request.RequestId, parcels.Values.OrderBy(p => p.ParcelId, StringComparer.Ordinal).ToList());
    Console.WriteLine(JsonSerializer.Serialize(res, jsonContext.ParcelResponse));
}

static bool IsValidStateTransition(string parcelState, string targetState) => (parcelState, targetState) switch {
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

    public string ParcelId { get; }

    public string Status { get; set; } = "NOT_CREATED";

    public string CurrentFacility { get; set; } = "";

    public long LastUpdated { get; set; } = 0;

    public List<string> History { get; } = new List<string>();

    public List<Anomaly> Anomalies { get; } = new List<Anomaly>();
}

record Anomaly(string EventId, string Reason);
