// Harness-only oracle. Never distribute this as participant starter code.
export const statuses = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'] as const;
export type Status = typeof statuses[number];
export interface Event { eventId: string; parcelId: string; timestamp: number; type: Status; facilityId: string }
export interface Request { requestId: string; events: Event[] }
interface Parcel {
  parcelId: string;
  status: Status | 'NOT_CREATED';
  currentFacility: string;
  lastUpdated: number;
  history: Status[];
  anomalies: { eventId: string; reason: 'MISSING_CREATED' | 'INVALID_TRANSITION' }[];
}
interface Response { requestId: string; parcels: Parcel[] }
const edges: Record<Status | 'NOT_CREATED', readonly Status[]> = {
  NOT_CREATED: ['CREATED'],
  CREATED: ['PICKED_UP'], PICKED_UP: ['IN_TRANSIT'], IN_TRANSIT: ['AT_SORTING_CENTER'],
  AT_SORTING_CENTER: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'], OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: [], RETURNED: [],
};
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function reference(request: Request): Response {
  const seen = new Set<string>(), parcels = new Map<string, Parcel>(), retained: Event[] = [];
  for (const event of request.events) {
    if (seen.has(event.eventId)) continue;
    seen.add(event.eventId);
    if (!parcels.has(event.parcelId)) parcels.set(event.parcelId, {
      parcelId: event.parcelId, status: 'NOT_CREATED', currentFacility: '', lastUpdated: 0, history: [], anomalies: [],
    });
    retained.push(event);
  }
  retained.sort((a, b) => a.timestamp - b.timestamp || compare(a.eventId, b.eventId));
  for (const event of retained) {
    const p = parcels.get(event.parcelId)!;
    if (!edges[p.status].includes(event.type)) {
      p.anomalies.push({ eventId: event.eventId, reason: p.status === 'NOT_CREATED' ? 'MISSING_CREATED' : 'INVALID_TRANSITION' });
      continue;
    }
    p.status = event.type; p.currentFacility = event.facilityId; p.lastUpdated = event.timestamp; p.history.push(event.type);
  }
  return { requestId: request.requestId, parcels: [...parcels.values()].sort((a, b) => compare(a.parcelId, b.parcelId)) };
}
