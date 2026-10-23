import { readFileSync } from 'node:fs';
import type { Request } from './reference.js';
import { edgeCases } from './edge-cases.js';

export function random(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function fixedCases(): Request[] {
  const smoke = JSON.parse(readFileSync(new URL('../examples/smoke.input.jsonl', import.meta.url), 'utf8')) as Request;
  return [
    { requestId: 'empty', events: [] }, smoke,
    { requestId: 'ties-and-invalids', events: [
      { eventId: 'z', vehicleId: 'v', timestamp: 5, type: 'battery', percentage: 80 },
      { eventId: 'a', vehicleId: 'v', timestamp: 5, type: 'battery', percentage: 20 },
      { eventId: 'bad', vehicleId: 'ghost', timestamp: 999, type: 'location', latitude: 91, longitude: 0 },
      { eventId: 'bad', vehicleId: 'ghost', timestamp: 1000, type: 'battery', percentage: 10 },
      { eventId: 'z', vehicleId: 'other', timestamp: 1000, type: 'battery', percentage: 10 },
      { eventId: 'old', vehicleId: 'v', timestamp: 1, type: 'status', status: 'reserved' },
      { eventId: 'future', vehicleId: 'v', timestamp: 999, type: 'status', status: 'broken' }
    ] },
    { requestId: 'validation', events: [null, [], 1, {},
      ...[-1, 1.5, 9007199254740992, '2', null].map((timestamp, i) => ({ eventId: `t${i}`, vehicleId: 'ghost', timestamp, type: 'battery', percentage: 10 })),
      ...[-1, 101, '50', null, true].map((percentage, i) => ({ eventId: `b${i}`, vehicleId: 'ghost', timestamp: 100, type: 'battery', percentage })),
      ...[null, 'Available', 1, ''].map((status, i) => ({ eventId: `s${i}`, vehicleId: 'ghost', timestamp: 100, type: 'status', status })),
      ...[[-90, -180], [90, 180], [0, 0]].map(([latitude, longitude], i) => ({ eventId: `l${i}`, vehicleId: `V${i}`, timestamp: 0, type: 'location', latitude, longitude })),
      ...['', 'space id', null, 12].map((vehicleId, i) => ({ eventId: `v${i}`, vehicleId, timestamp: 0, type: 'battery', percentage: 0 })),
      { eventId: 'zero', vehicleId: 'A', timestamp: 0, type: 'battery', percentage: 0 },
      { eventId: 'full', vehicleId: 'a', timestamp: 9007199254740991, type: 'battery', percentage: 100 }
    ] },
    { requestId: 'property-ordering', events: [
      { eventId: 'sZ', vehicleId: 'v', timestamp: 20, type: 'status', status: 'driving' },
      { eventId: 'sa', vehicleId: 'v', timestamp: 20, type: 'status', status: 'maintenance' },
      { eventId: 'l2', vehicleId: 'v', timestamp: 10, type: 'location', latitude: 1.25, longitude: -2.5 },
      { eventId: 'l10', vehicleId: 'v', timestamp: 10, type: 'location', latitude: 9, longitude: 9 },
      { eventId: 'b', vehicleId: 'v', timestamp: 5, type: 'battery', percentage: 33.5, status: 'charging' },
      { eventId: 'bad-lat', vehicleId: 'v', timestamp: 200, type: 'location', latitude: '1', longitude: 2 },
      { eventId: 'bad-lon', vehicleId: 'v', timestamp: 200, type: 'location', latitude: 1, longitude: -181 },
      { eventId: 'missing', vehicleId: 'v', timestamp: 200, type: 'location', latitude: 1 },
      { eventId: 'unknown', vehicleId: 'ghost', timestamp: 999, type: 'speed', speed: 50 },
      { eventId: '', vehicleId: 'ghost', timestamp: 999, type: 'battery', percentage: 10 },
      { eventId: 'x'.repeat(129), vehicleId: 'ghost', timestamp: 999, type: 'battery', percentage: 10 }
    ] },
    // Reuse IDs and vehicle names to catch state leaking between requests.
    { requestId: 'reset', events: [{ eventId: 'b', vehicleId: 'v', timestamp: 0, type: 'battery', percentage: 1 }] },
    { requestId: 'reset-empty', events: [] },
    ...edgeCases()
  ];
}
export function* generateCases(seed: number, count: number): Generator<Request> {
  const rng = random(seed);
  const integer = (n: number) => Math.floor(rng() * n);
  for (let c = 0; c < count; c++) {
    const fleet = c % 4 === 0 ? 400 : c % 4 === 1 ? 1 : 30;
    const size = c % 4 === 0 ? 5000 : 150 + integer(700);
    const events: unknown[] = [];
    for (let i = 0; i < size; i++) {
      const base = { eventId: `e${c}-${i}`, vehicleId: `vehicle-${integer(fleet)}`, timestamp: integer(50) };
      const kind = integer(3);
      const event = kind === 0 ? { ...base, type: 'location', latitude: integer(181) - 90, longitude: integer(361) - 180 }
        : kind === 1 ? { ...base, type: 'battery', percentage: integer(101) }
        : { ...base, type: 'status', status: ['available', 'reserved', 'driving', 'charging', 'maintenance'][integer(5)] };
      if (rng() < 0.15) Object.assign(event, kind === 0 ? { longitude: 181 } : kind === 1 ? { percentage: -1 } : { status: 'invalid' });
      events.push(event);
      if (rng() < 0.1) events.push({ ...event });
      if (rng() < 0.08) events.push({ ...event, vehicleId: 'conflict', timestamp: 9999 });
    }
    for (let i = events.length - 1; i > 0; i--) {
      const j = integer(i + 1); [events[i], events[j]] = [events[j], events[i]];
    }
    yield { requestId: `random-${c}`, events };
  }
}
