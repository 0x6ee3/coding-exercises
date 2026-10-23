import type { Request } from './reference.js';

export function edgeCases(): Request[] {
  const valid = { eventId: 'id', vehicleId: 'v', timestamp: 1, type: 'battery', percentage: 50 };
  const invalid: unknown[] = [false, '', null, [], {}];
  const fields: Record<string, unknown[]> = {
    eventId: ['', 'bad\n', 'bad\r', 'é', 'has space', 'x'.repeat(129), null, 1, true],
    vehicleId: ['', 'bad\n', 'bad\r', 'é', 'has space', 'x'.repeat(129), null, 1, true],
    timestamp: [-1, 0.5, 9007199254740992, '1', null, true],
    type: ['Battery', 'unknown', '', null, 1, true],
    percentage: [-0.5, 100.5, '50', null, true, {}, []]
  };
  let sequence = 0;
  for (const [field, values] of Object.entries(fields)) {
    for (const value of values) invalid.push({ ...valid, eventId: `bad-${sequence++}`, [field]: value });
    const missing: Record<string, unknown> = { ...valid, eventId: `missing-${sequence++}` };
    delete missing[field]; invalid.push(missing);
  }
  for (const field of ['latitude', 'longitude']) {
    for (const value of [null, true, '0', {}, [], field === 'latitude' ? -90.1 : -180.1, field === 'latitude' ? 90.1 : 180.1]) {
      invalid.push({ eventId: `coordinate-${sequence++}`, vehicleId: 'v', timestamp: 999, type: 'location', latitude: 0, longitude: 0, [field]: value });
    }
  }
  invalid.push({ eventId: 'missing-status', vehicleId: 'v', timestamp: 99, type: 'status' });
  const ids = ['10', '2', 'Z', '_', 'a', 'a0', 'constructor', '__proto__', 'v'.repeat(128)];
  return [
    { requestId: 'invalid-only', events: invalid },
    { requestId: 'identifier-boundaries', events: ids.map((vehicleId, i) => ({ ...valid, eventId: i === 0 ? 'e'.repeat(128) : `id${i}`, vehicleId })) },
    { requestId: 'every-status', events: ['available', 'reserved', 'driving', 'charging', 'maintenance'].map((status, i) => ({ eventId: `s${i}`, vehicleId: `v${i}`, timestamp: 0, type: 'status', status })) },
    { requestId: 'duplicate-precedence', events: [
      { ...valid, eventId: 'bad-vehicle', vehicleId: null }, { ...valid, eventId: 'bad-vehicle' },
      { ...valid, eventId: 'bad-type', type: 'unknown' }, { ...valid, eventId: 'bad-type' },
      { ...valid, eventId: 'bad-time', timestamp: 0.5 }, { ...valid, eventId: 'bad-time' },
      { ...valid, eventId: 'first', percentage: 10 },
      { eventId: 'first', vehicleId: 'v', timestamp: 100, type: 'status', status: 'driving' },
      { ...valid, eventId: 'first', vehicleId: 'other', timestamp: 200, percentage: 90 },
      { ...valid, eventId: 'first', timestamp: 300, percentage: 80 }
    ] },
    { requestId: 'prefix-ties', events: [
      { ...valid, eventId: 'e0', percentage: 25 }, { ...valid, eventId: 'e', percentage: 75 },
      { ...valid, eventId: 'e00', percentage: 50 }, { ...valid, eventId: 'old', timestamp: 0, percentage: 99 }
    ] },
    { requestId: 'large-timestamps', events: [
      { ...valid, eventId: 'new', timestamp: 9007199254740991, percentage: 11 },
      { ...valid, eventId: 'old', timestamp: 9007199254740990, percentage: 22 }
    ] }
  ];
}
