// Harness-only oracle. Never distribute this as participant starter code.
export const statuses = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'] as const;
export type Status = typeof statuses[number];
interface Parcel {
  parcelId: string;
  status: Status | null;
  currentFacility: string | null;
  lastUpdated: number | null;
  history: Status[];
  anomalies: { eventId: string; reason: string }[];
}
interface Response {
  requestId: string | null;
  parcels: Parcel[];
  errors: { index?: number; eventId?: string; reason: string }[];
}
interface ValidEvent { eventId: string; parcelId: string; timestamp: number; type: Status; facilityId: string }
const edges: Record<Status, readonly Status[]> = {
  CREATED: ['PICKED_UP'], PICKED_UP: ['IN_TRANSIT'], IN_TRANSIT: ['AT_SORTING_CENTER'],
  AT_SORTING_CENTER: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'], OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: [], RETURNED: [],
};
export const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const object = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const id = (x: unknown): x is string => typeof x === 'string' && x.length > 0;
export function reference(request: unknown): Response {
  const result: Response = { requestId: object(request) && typeof request.requestId === 'string' ? request.requestId : null, parcels: [], errors: [] };
  if (!object(request) || !id(request.requestId) || !Array.isArray(request.events)) {
    result.errors.push({ reason: 'INVALID_REQUEST' });
    return result;
  }
  const seen = new Set<string>(), parcels = new Map<string, Parcel>(), valid: ValidEvent[] = [];
  request.events.forEach((event: unknown, index: number) => {
    if (!object(event)) { result.errors.push({ index, reason: 'INVALID_EVENT' }); return; }
    if (!id(event.eventId)) { result.errors.push({ index, reason: 'INVALID_EVENT_ID' }); return; }
    if (seen.has(event.eventId)) return;
    seen.add(event.eventId);
    if (!id(event.parcelId)) { result.errors.push({ index, eventId: event.eventId, reason: 'INVALID_PARCEL_ID' }); return; }
    if (!parcels.has(event.parcelId)) parcels.set(event.parcelId, { parcelId: event.parcelId, status: null, currentFacility: null, lastUpdated: null, history: [], anomalies: [] });
    const p = parcels.get(event.parcelId)!;
    let reason;
    if (['timestamp', 'type', 'facilityId'].some(k => !Object.hasOwn(event, k))) reason = 'MISSING_FIELD';
    else if (typeof event.timestamp !== 'number' || !Number.isSafeInteger(event.timestamp) || event.timestamp < 0) reason = 'INVALID_TIMESTAMP';
    else if (!(statuses as readonly unknown[]).includes(event.type)) reason = 'INVALID_EVENT_TYPE';
    else if (!id(event.facilityId)) reason = 'INVALID_FACILITY_ID';
    if (reason) p.anomalies.push({ eventId: event.eventId, reason });
    // All wire fields have passed the validation above.
    else valid.push(event as unknown as ValidEvent);
  });
  valid.sort((a, b) => a.timestamp - b.timestamp || compare(a.eventId, b.eventId));
  for (const event of valid) {
    const p = parcels.get(event.parcelId)!;
    const reason = p.status === null ? (event.type === 'CREATED' ? null : 'MISSING_CREATED') : (edges[p.status].includes(event.type) ? null : 'INVALID_TRANSITION');
    if (reason) { p.anomalies.push({ eventId: event.eventId, reason }); continue; }
    p.status = event.type; p.currentFacility = event.facilityId; p.lastUpdated = event.timestamp; p.history.push(event.type);
  }
  result.parcels = [...parcels.values()].sort((a, b) => compare(a.parcelId, b.parcelId));
  return result;
}
