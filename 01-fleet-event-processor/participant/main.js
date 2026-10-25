const readline = require('node:readline')
const { stdin, stdout, stderr } = require('node:process')

const rl = readline.createInterface({ input: stdin })
rl.on('close', () => process.exit(0))
rl.on('line', (line) => {
    const req = JSON.parse(line)
    const vehicles = {}
    const processesEvents = new Set()

    for (let event of req.events) {
        if (processesEvents.has(event.eventId)) {
            // stderr.write(`duplicate event ${event.eventId}\n`)
            continue
        }
        processesEvents.add(event.eventId)
        if (!isValidEvent(event)) {
            // stderr.write(`event ${event.eventId} in invalid\n`)
            continue
        }

        let vehicle = vehicles[event.vehicleId]
        if (vehicle == null) {
            vehicle = {
                battery: null,
                location: null,
                status: null,
                lastSeenBattery: null,
                lastSeenBatteryId: null,
                lastSeenLocation: null,
                lastSeenLocationId: null,
                lastSeenStatus: null,
                lastSeenStatusId: null
            }
        }

        if (event.type === 'battery') {
            if (event.timestamp < vehicle.lastSeenBattery) {
                continue
            }
            if (event.timestamp === vehicle.lastSeenBattery &&
                event.eventId <= vehicle.lastSeenBatteryId) { 
                continue
            }            
            vehicle.battery = event.percentage
            vehicle.lastSeenBatteryId = event.eventId
            vehicle.lastSeenBattery = event.timestamp
        } else if (event.type === 'location') {
            if (event.timestamp < vehicle.lastSeenLocation) {
                continue
            }
            if (event.timestamp === vehicle.lastSeenLocation &&
                event.eventId <= vehicle.lastSeenLocationId) { 
                continue
            }        
            vehicle.location = { latitude: event.latitude, longitude: event.longitude }
            vehicle.lastSeenLocationId = event.eventId
            vehicle.lastSeenLocation = event.timestamp
        } else if (event.type === 'status') {
            if (event.timestamp < vehicle.lastSeenStatus) {
                continue
            }
            if (event.timestamp === vehicle.lastSeenStatus &&
                event.eventId <= vehicle.lastSeenStatusId) { 
                continue
            }            
            vehicle.status = event.status
            vehicle.lastSeenStatusId = event.eventId
            vehicle.lastSeenStatus = event.timestamp    
        } else {
            stderr.write(`event ${event.eventId} has unknown type ${event.type}\n`)
            continue
        }

        vehicles[event.vehicleId] = vehicle
    }

    const resVehicles = Object.keys(vehicles).sort()
        .map(vehicleId => ({
            vehicleId: vehicleId,
            battery: vehicles[vehicleId].battery,
            location: vehicles[vehicleId].location,
            status: vehicles[vehicleId].status,
            lastSeen: Math.max(
                vehicles[vehicleId].lastSeenBattery,
                vehicles[vehicleId].lastSeenLocation,
                vehicles[vehicleId].lastSeenStatus
            )
        }))
        
    const res = {
        requestId: req.requestId,
        vehicles: resVehicles || []
    }
    // stderr.write(`vehicles: ${JSON.stringify(vehicles)}\n`)
    // stderr.write(`response: ${JSON.stringify(res)}\n`)
    stdout.write(`${JSON.stringify(res)}\n`)
})

function isValidEvent(event) {
    if (event.type == 'battery') {
        return 0 <= event.percentage && event.percentage <= 100
    } else if (event.type == 'location') {
        return -90 <= event.latitude && event.latitude <= 90 && -180 <= event.longitude && event.longitude <= 180
    } else if (event.type == 'status') {
        return ['available', 'reserved', 'driving', 'charging', 'maintenance'].includes(event.status)
    }
    return false
}
