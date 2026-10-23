// Harness-private oracle. This module is never loaded into a participant process.
export interface Request { requestId: string; events: unknown[] }
export interface Vehicle {
  vehicleId: string;
  location: { latitude: number; longitude: number } | null;
  battery: number | null;
  status: string | null;
  lastSeen: number;
}
export interface Response { requestId: string; vehicles: Vehicle[] }
export const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const record = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const identifier = (x: unknown): x is string => typeof x === 'string' && x.length >= 1 && x.length <= 128 && !/[^A-Za-z0-9_-]/.test(x);
const numberIn = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isFinite(x) && x >= min && x <= max;

export function expected(request: Request): Response {
  const seen = new Set<string>();
  const vehicles = new Map<string, Vehicle>();
  const winners = new Map<string, Map<string, { timestamp: number; eventId: string }>>();
  for (const event of request.events) {
    if (!record(event) || !identifier(event.eventId)) continue;
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    if (!identifier(event.vehicleId) || typeof event.timestamp !== 'number' || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) continue;
    let property: 'location' | 'battery' | 'status';
    let value: Vehicle['location'] | number | string;
    if (event.type === 'location' && numberIn(event.latitude, -90, 90) && numberIn(event.longitude, -180, 180)) {
      property = 'location'; value = { latitude: event.latitude, longitude: event.longitude };
    } else if (event.type === 'battery' && numberIn(event.percentage, 0, 100)) {
      property = 'battery'; value = event.percentage;
    } else if (event.type === 'status' && typeof event.status === 'string' && ['available', 'reserved', 'driving', 'charging', 'maintenance'].includes(event.status)) {
      property = 'status'; value = event.status;
    } else continue;
    let vehicle = vehicles.get(event.vehicleId);
    if (!vehicle) {
      vehicle = { vehicleId: event.vehicleId, location: null, battery: null, status: null, lastSeen: event.timestamp };
      vehicles.set(event.vehicleId, vehicle);
      winners.set(event.vehicleId, new Map());
    }
    vehicle.lastSeen = Math.max(vehicle.lastSeen, event.timestamp);
    const winning = winners.get(event.vehicleId)!;
    const previous = winning.get(property);
    if (!previous || event.timestamp > previous.timestamp || (event.timestamp === previous.timestamp && compareIds(event.eventId, previous.eventId) > 0)) {
      Object.assign(vehicle, { [property]: value });
      winning.set(property, { timestamp: event.timestamp, eventId: event.eventId });
    }
  }
  return { requestId: request.requestId, vehicles: [...vehicles.values()].sort((a, b) => compareIds(a.vehicleId, b.vehicleId)) };
}
