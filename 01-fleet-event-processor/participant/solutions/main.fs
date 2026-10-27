open System
open System.Text.Json

type Coordinates =
    { Latitude: float
      Longitude: float }

type Payload =
    | Battery of float
    | Location of Coordinates
    | Status of string

type VehicleEvent =
    { EventId: string
      VehicleId: string
      Timestamp: int
      Payload: Payload }

type Vehicle =
    { VehicleId: string
      Location: Coordinates option
      Battery: float option
      Status: string option
      LastSeen: int }

let validStatuses =
    set [ "available"; "reserved"; "driving"; "charging"; "maintenance" ]

let isValid event =
    match event.Payload with
    | Battery percentage ->
        percentage >= 0.0 && percentage <= 100.0
    | Location coordinates ->
        coordinates.Latitude >= -90.0
        && coordinates.Latitude <= 90.0
        && coordinates.Longitude >= -180.0
        && coordinates.Longitude <= 180.0
    | Status status ->
        Set.contains status validStatuses

let emptyVehicle vehicleId =
    { VehicleId = vehicleId
      Location = None
      Battery = None
      Status = None
      LastSeen = 0 }

let applyEvent vehicle event =
    let updated =
        match event.Payload with
        | Battery percentage ->
            { vehicle with Battery = Some percentage }
        | Location coordinates ->
            { vehicle with Location = Some coordinates }
        | Status status ->
            { vehicle with Status = Some status }

    { updated with LastSeen = event.Timestamp }

let compareEvents left right =
    let timestampOrder = compare left.Timestamp right.Timestamp

    if timestampOrder <> 0 then timestampOrder
    else StringComparer.Ordinal.Compare(left.EventId, right.EventId)

let reconstruct events =
    events
    |> Seq.distinctBy (fun event -> event.EventId)
    |> Seq.filter isValid
    |> Seq.sortWith compareEvents
    |> Seq.fold (fun vehicles event ->
        let vehicle =
            vehicles
            |> Map.tryFind event.VehicleId
            |> Option.defaultWith (fun () -> emptyVehicle event.VehicleId)

        Map.add event.VehicleId (applyEvent vehicle event) vehicles
    ) Map.empty
    |> Map.toArray
    |> Array.map snd
    |> Array.sortWith (fun left right ->
        StringComparer.Ordinal.Compare(left.VehicleId, right.VehicleId))

let decodeEvent (json: JsonElement) =
    let text name = json.GetProperty(name).GetString()
    let number name = json.GetProperty(name).GetDouble()

    let payload =
        match text "type" with
        | "battery" -> Battery(number "percentage")
        | "location" ->
            Location
                { Latitude = number "latitude"
                  Longitude = number "longitude" }
        | "status" -> Status(text "status")
        | other -> failwithf "Unsupported event type: %s" other

    { EventId = text "eventId"
      VehicleId = text "vehicleId"
      Timestamp = json.GetProperty("timestamp").GetInt32()
      Payload = payload }

let jsonOptions =
    JsonSerializerOptions(PropertyNamingPolicy = JsonNamingPolicy.CamelCase)

let processLine (line: string) =
    use document = JsonDocument.Parse(line)
    let request = document.RootElement

    let vehicles =
        request.GetProperty("events").EnumerateArray()
        |> Seq.map decodeEvent
        |> reconstruct
        |> Array.map (fun vehicle ->
            {| vehicleId = vehicle.VehicleId
               location =
                   vehicle.Location
                   |> Option.map box
                   |> Option.defaultValue null
               battery = Option.toNullable vehicle.Battery
               status = Option.toObj vehicle.Status
               lastSeen = vehicle.LastSeen |})

    let response =
        {| requestId = request.GetProperty("requestId").GetString()
           vehicles = vehicles |}

    JsonSerializer.Serialize(response, jsonOptions)

let rec run () =
    match Console.ReadLine() with
    | null -> ()
    | line ->
        Console.WriteLine(processLine line)
        Console.Out.Flush()
        run ()

run ()