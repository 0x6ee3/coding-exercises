// Harness-only oracle. Never distribute this as participant starter code.
export const statuses = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY', 'DELIVERED', 'RETURNED'];
const edges = {
  CREATED: ['PICKED_UP'], PICKED_UP: ['IN_TRANSIT'], IN_TRANSIT: ['AT_SORTING_CENTER'],
  AT_SORTING_CENTER: ['IN_TRANSIT', 'OUT_FOR_DELIVERY'], OUT_FOR_DELIVERY: ['DELIVERED', 'RETURNED'],
  DELIVERED: [], RETURNED: [],
};
export const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
// Explicit protocol whitespace, independent of runtime Unicode trim tables.
const id = x => typeof x === 'string' && /[^\u0009-\u000d\u0020]/.test(x);
export function reference(request) {
  const result = { requestId: object(request) && typeof request.requestId === 'string' ? request.requestId : null, parcels: [], errors: [] };
  if (!object(request) || !id(request.requestId) || !Array.isArray(request.events)) {
    result.errors.push({ reason: 'INVALID_REQUEST' });
    return result;
  }
  const seen = new Set(), parcels = new Map(), valid = [];
  request.events.forEach((event, index) => {
    if (!object(event)) { result.errors.push({ index, reason: 'INVALID_EVENT' }); return; }
    if (!id(event.eventId)) { result.errors.push({ index, reason: 'INVALID_EVENT_ID' }); return; }
    if (seen.has(event.eventId)) return;
    seen.add(event.eventId);
    if (!id(event.parcelId)) { result.errors.push({ index, eventId: event.eventId, reason: 'INVALID_PARCEL_ID' }); return; }
    if (!parcels.has(event.parcelId)) parcels.set(event.parcelId, { parcelId: event.parcelId, status: null, currentFacility: null, lastUpdated: null, history: [], anomalies: [] });
    const p = parcels.get(event.parcelId);
    let reason;
    if (['timestamp', 'type', 'facilityId'].some(k => !Object.hasOwn(event, k))) reason = 'MISSING_FIELD';
    else if (!Number.isSafeInteger(event.timestamp) || event.timestamp < 0) reason = 'INVALID_TIMESTAMP';
    else if (!statuses.includes(event.type)) reason = 'INVALID_EVENT_TYPE';
    else if (!id(event.facilityId)) reason = 'INVALID_FACILITY_ID';
    if (reason) p.anomalies.push({ eventId: event.eventId, reason });
    else valid.push(event);
  });
  valid.sort((a, b) => a.timestamp - b.timestamp || compare(a.eventId, b.eventId));
  for (const event of valid) {
    const p = parcels.get(event.parcelId);
    const reason = p.status === null ? (event.type === 'CREATED' ? null : 'MISSING_CREATED') : (edges[p.status].includes(event.type) ? null : 'INVALID_TRANSITION');
    if (reason) { p.anomalies.push({ eventId: event.eventId, reason }); continue; }
    p.status = event.type; p.currentFacility = event.facilityId; p.lastUpdated = event.timestamp; p.history.push(event.type);
  }
  result.parcels = [...parcels.values()].sort((a, b) => compare(a.parcelId, b.parcelId));
  return result;
}
