const readline = require('node:readline')
const { stdin, stdout, stderr } = require('node:process')

const rl = readline.createInterface({ input: stdin })
rl.on('close', () => process.exit(0))
rl.on('line', (line) => {
    const req = JSON.parse(line)
    const vehicles = new Map()
    const seenEvents = new Set()

    for (let event of req.events) {
        if (seenEvents.has(event.eventId)) {
            // stderr.write(`duplicate event ${event.eventId}\n`)
            continue
        }
        seenEvents.add(event.eventId)
        if (!isValidEvent(event)) {
            // stderr.write(`event ${event.eventId} in invalid\n`)
            continue
        }

        let vehicle = vehicles.get(event.vehicleId)
        if (!vehicle) {
            vehicle = {
                battery: null,
                location: null,
                status: null
            }
            vehicles.set(event.vehicleId, vehicle)
        }

        if (isNewer(event, vehicle[event.type])) {
            vehicle[event.type] = event
        }
    }

    const resVehicles = [...vehicles.entries()]
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([vehicleId, { battery, location, status }]) => ({
            vehicleId,
            battery: battery?.percentage ?? null,
            location: location === null ? null : {
                latitude: location.latitude,
                longitude: location.longitude
            },
            status: status?.status ?? null,
            lastSeen: Math.max(
                ...[battery, location, status]
                    .filter(event => event !== null)
                    .map(event => event.timestamp)
            )
        }))
        
    const res = {
        requestId: req.requestId,
        vehicles: resVehicles
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

function isNewer(candidate, current) {
    return current === null ||
        candidate.timestamp > current.timestamp ||
        (
            candidate.timestamp === current.timestamp &&
            candidate.eventId > current.eventId
        )
}
