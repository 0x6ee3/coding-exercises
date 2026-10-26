import type { Request, FleetEvent } from './reference.ts';

export function edgeCases(): Request[] {
  const valid = { eventId: 'id', vehicleId: 'v', timestamp: 1, type: 'battery' as const, percentage: 50 };
  const invalid: FleetEvent[] = [
    ...[-0.5, 100.5].map((percentage, i) => ({ ...valid, eventId: `battery-${i}`, percentage })),
    ...[-90.1, 90.1].map((latitude, i) => ({ eventId: `latitude-${i}`, vehicleId: 'v', timestamp: 999, type: 'location' as const, latitude, longitude: 0 })),
    ...[-180.1, 180.1].map((longitude, i) => ({ eventId: `longitude-${i}`, vehicleId: 'v', timestamp: 999, type: 'location' as const, latitude: 0, longitude })),
    ...['', 'Available', 'broken'].map((status, i) => ({ eventId: `status-${i}`, vehicleId: 'v', timestamp: 999, type: 'status' as const, status }))
  ];
  const ids = ['vehicle-10', 'vehicle-2', 'Vehicle-A', 'vehicle-a', 'vehicle-a0'];
  return [
    { requestId: 'invalid-only', events: invalid },
    { requestId: 'vehicle-ordering', events: ids.map((vehicleId, i) => ({ ...valid, eventId: `id${i}`, vehicleId })) },
    { requestId: 'every-status', events: ['available', 'reserved', 'driving', 'charging', 'maintenance'].map((status, i) => ({ eventId: `s${i}`, vehicleId: `v${i}`, timestamp: 0, type: 'status', status })) },
    { requestId: 'duplicate-precedence', events: [
      { eventId: 'bad-location', vehicleId: 'v', timestamp: 9, type: 'location', latitude: 91, longitude: 0 },
      { eventId: 'bad-location', vehicleId: 'v', timestamp: 10, type: 'location', latitude: 1, longitude: 2 },
      { ...valid, eventId: 'bad-battery', percentage: 101 }, { ...valid, eventId: 'bad-battery' },
      { eventId: 'bad-status', vehicleId: 'v', timestamp: 9, type: 'status', status: 'broken' },
      { eventId: 'bad-status', vehicleId: 'v', timestamp: 10, type: 'status', status: 'driving' },
      { ...valid, eventId: 'first', percentage: 10 },
      { eventId: 'first', vehicleId: 'v', timestamp: 100, type: 'status', status: 'driving' },
      { ...valid, eventId: 'first', vehicleId: 'other', timestamp: 200, percentage: 90 },
      { ...valid, eventId: 'first', timestamp: 300, percentage: 80 }
    ] },
    { requestId: 'prefix-ties', events: [
      { ...valid, eventId: 'e0', percentage: 25 }, { ...valid, eventId: 'e', percentage: 75 },
      { ...valid, eventId: 'e00', percentage: 50 }, { ...valid, eventId: 'old', timestamp: 0, percentage: 99 }
    ] },
    { requestId: 'newer-timestamps', events: [
      { ...valid, eventId: 'new', timestamp: 1720000001, percentage: 11 },
      { ...valid, eventId: 'old', timestamp: 1720000000, percentage: 22 }
    ] }
  ];
}
