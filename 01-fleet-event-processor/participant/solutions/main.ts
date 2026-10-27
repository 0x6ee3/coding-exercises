import readline from 'node:readline'
import { stdin, stdout } from 'node:process'

type BaseEvent = {
    eventId: string
    vehicleId: string
    timestamp: number 
}

type BatteryEvent = BaseEvent & {
    type: 'battery'
    percentage: number
}

type LocationEvent = BaseEvent & {
    type: 'location'
    latitude: number
    longitude: number
}

type StatusEvent = BaseEvent & {
    type: 'status'
    status: string
}

type VehicleEvent = BatteryEvent | LocationEvent | StatusEvent

type Request = {
    requestId: string
    events: VehicleEvent[]
}

type VehicleResponse = {
    vehicleId: string
    battery: number | null
    location: {
        latitude: number
        longitude: number
    } | null
    status: string | null
    lastSeen: number
}

type Response = {
    requestId: string
    vehicles: VehicleResponse[]
}

const rl = readline.createInterface({ input: stdin })
rl.on('close', () => process.exit(0))
rl.on('line', (line: string) => {
    const req: Request = JSON.parse(line)
    const vehicles = new Map<string, VehicleResponse>()
    const seen = new Set<string>()

    // Deduplicate before sorting: an invalid first occurrence still reserves its ID.
    const events = req.events
        .filter(event => {
            if (seen.has(event.eventId)) return false
            seen.add(event.eventId)
            return isValidEvent(event)
        })
        .sort((a, b) => a.timestamp - b.timestamp || compareIds(a.eventId, b.eventId))

    // Replay oldest first, so the last event for each property wins.
    for (const event of events) {
        let vehicle = vehicles.get(event.vehicleId)
        if (vehicle === undefined) {
            vehicle = {
                vehicleId: event.vehicleId,
                battery: null,
                location: null,
                status: null,
                lastSeen: 0
            }
            vehicles.set(event.vehicleId, vehicle)
        }

        switch (event.type) {
            case 'battery':
                vehicle.battery = event.percentage
                break
            case 'location':
                vehicle.location = { latitude: event.latitude, longitude: event.longitude }
                break
            case 'status':
                vehicle.status = event.status
                break
        }
        vehicle.lastSeen = event.timestamp
    }

    const res: Response = {
        requestId: req.requestId,
        vehicles: [...vehicles.values()].sort((a, b) => compareIds(a.vehicleId, b.vehicleId))
    }
    stdout.write(`${JSON.stringify(res)}\n`)
})

function isValidEvent(event: VehicleEvent) {
    if (event.type == 'battery') {
        return 0 <= event.percentage && event.percentage <= 100
    } else if (event.type == 'location') {
        return -90 <= event.latitude && event.latitude <= 90 && -180 <= event.longitude && event.longitude <= 180
    } else if (event.type == 'status') {
        return ['available', 'reserved', 'driving', 'charging', 'maintenance'].includes(event.status)
    }
    return false
}

function compareIds(a: string, b: string): number {
    return a < b ? -1 : a > b ? 1 : 0
}
