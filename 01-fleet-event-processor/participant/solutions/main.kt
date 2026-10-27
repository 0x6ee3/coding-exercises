import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

@Serializable
sealed interface VehicleEvent {
    val eventId: String
    val vehicleId: String
    val timestamp: Int
}

@Serializable
@SerialName("battery")
data class BatteryEvent(
    override val eventId: String,
    override val vehicleId: String,
    override val timestamp: Int,
    val percentage: Double
) : VehicleEvent

@Serializable
@SerialName("location")
data class LocationEvent(
    override val eventId: String,
    override val vehicleId: String,
    override val timestamp: Int,
    val latitude: Double,
    val longitude: Double
) : VehicleEvent

@Serializable
@SerialName("status")
data class StatusEvent(
    override val eventId: String,
    override val vehicleId: String,
    override val timestamp: Int,
    val status: String
) : VehicleEvent

@Serializable
data class FleetRequest(
    val requestId: String,
    val events: List<VehicleEvent>
)

@Serializable
data class Coordinates(
    val latitude: Double,
    val longitude: Double
)

@Serializable
data class Vehicle(
    val vehicleId: String,
    var location: Coordinates? = null,
    var battery: Double? = null,
    var status: String? = null,
    var lastSeen: Int = 0
)

@Serializable
data class FleetResponse(
    val requestId: String,
    val vehicles: List<Vehicle>
)

val validStatuses = setOf(
    "available", "reserved", "driving", "charging", "maintenance"
)

fun VehicleEvent.isValid(): Boolean = when (this) {
    is BatteryEvent -> percentage in 0.0..100.0
    is LocationEvent ->
        latitude in -90.0..90.0 && longitude in -180.0..180.0
    is StatusEvent -> status in validStatuses
}

fun Vehicle.applyEvent(event: VehicleEvent) {
    when (event) {
        is BatteryEvent -> battery = event.percentage
        is LocationEvent ->
            location = Coordinates(event.latitude, event.longitude)
        is StatusEvent -> status = event.status
    }

    lastSeen = event.timestamp
}

fun reconstruct(request: FleetRequest): FleetResponse {
    val events = request.events
        .distinctBy { it.eventId }
        .filter { it.isValid() }
        .sortedWith(
            compareBy<VehicleEvent> { it.timestamp }
                .thenBy { it.eventId }
        )

    val vehicles = mutableMapOf<String, Vehicle>()

    for (event in events) {
        val vehicle = vehicles.getOrPut(event.vehicleId) {
            Vehicle(event.vehicleId)
        }

        vehicle.applyEvent(event)
    }

    return FleetResponse(
        requestId = request.requestId,
        vehicles = vehicles.values.sortedBy { it.vehicleId }
    )
}

fun main() {
    val json = Json {
        classDiscriminator = "type"
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    while (true) {
        val line = readlnOrNull() ?: break
        val request = json.decodeFromString<FleetRequest>(line)
        println(json.encodeToString(reconstruct(request)))
        System.out.flush()
    }
}
