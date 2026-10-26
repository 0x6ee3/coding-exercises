export type Message = Record<string, any>;
// JSON numbers have no distinct negative zero; object key order has no meaning.
export function sameJson(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k) && sameJson(a[k], b[k]));
}
export class Model {
  states = new Map<string, Message>();
  seen = new Set<string>();
  accepted = 0;
  duplicates = 0;
  stale = 0;
  invalid = 0;
  apply(e: Message): Message | undefined {
    if (!validEvent(e)) { this.invalid++; return; }
    if (this.seen.has(e.eventId)) { this.duplicates++; return; }
    this.seen.add(e.eventId);
    const previous = this.states.get(e.deviceId);
    if (previous && e.sequence <= previous.sequence) { this.stale++; return; }
    const data = e.type === 'LOCATION' ? { latitude: e.latitude, longitude: e.longitude }
      : e.type === 'BATTERY' ? { percentage: e.percentage } : { state: e.state };
    this.states.set(e.deviceId, { ...previous, deviceId: e.deviceId, sequence: e.sequence,
      timestamp: e.timestamp, data: { ...previous?.data, ...data } });
    this.accepted++;
    return { type: 'EVENT', eventId: e.eventId, deviceId: e.deviceId, sequence: e.sequence,
      eventType: e.type, timestamp: e.timestamp, data };
  }
  state(deviceId: string): Message {
    const state = this.states.get(deviceId);
    return state ? { type: 'STATE', ...state } : error('GET_STATE', deviceId, 'UNKNOWN_DEVICE');
  }
}
export const error = (command: string | null, deviceId: string | null, code: string) =>
  ({ type: 'ERROR', command, deviceId, code });
export function validEvent(e: Message): boolean {
  if (!e || typeof e !== 'object' || Array.isArray(e) || typeof e.eventId !== 'string' || !e.eventId.length
    || typeof e.deviceId !== 'string' || !e.deviceId.length || !Number.isSafeInteger(e.sequence)
    || e.sequence < 1 || !Number.isSafeInteger(e.timestamp) || e.timestamp < 0) return false;
  return e.type === 'LOCATION' ? Number.isFinite(e.latitude) && Math.abs(e.latitude) <= 90
    && Number.isFinite(e.longitude) && Math.abs(e.longitude) <= 180
    : e.type === 'BATTERY' ? Number.isFinite(e.percentage) && e.percentage >= 0 && e.percentage <= 100
      : e.type === 'STATUS' && ['ACTIVE', 'IDLE', 'OFFLINE'].includes(e.state);
}
export function compareEvents(expected: Message[], actual: Message[]) {
  const remaining = [...expected];
  let unexpected = 0, orderErrors = 0;
  for (const event of actual) {
    const index = remaining.findIndex(e => sameJson(e, event));
    if (index < 0) { unexpected++; continue; }
    if (remaining.slice(0, index).some(e => e.deviceId === event.deviceId)) orderErrors++;
    remaining.splice(index, 1);
  }
  return { missing: remaining.length, unexpected, orderErrors };
}
