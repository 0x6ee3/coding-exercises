import type { Message } from './model.ts';
export function random(seed: number) {
  let x = seed >>> 0;
  return () => { x += 0x6D2B79F5; let t = Math.imul(x ^ x >>> 15, 1 | x);
    t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function generate(seed: number, devices: number, count: number): Message[] {
  const rng = random(seed), sequences = Array(devices).fill(0), events: Message[] = [];
  for (let i = 0; i < count; i++) {
    if (events.length && rng() < 0.12) { events.push({ ...events[Math.floor(rng() * events.length)] }); continue; }
    // Squaring biases traffic toward a subset of frequently active devices.
    const device = Math.floor(rng() ** 2 * devices), sequence = ++sequences[device];
    const kind = Math.floor(rng() * 3);
    events.push({ type: ['LOCATION', 'BATTERY', 'STATUS'][kind], eventId: `generated-${seed}-${i}`,
      deviceId: `tracker-${device}`, sequence: sequence + 10, timestamp: 1720000000 + i,
      ...(kind === 0 ? { latitude: 52.52 + rng() * 0.01, longitude: 13.405 + rng() * 0.01 }
        : kind === 1 ? { percentage: Math.max(0, 100 - sequence * 0.1) }
          : { state: ['ACTIVE', 'IDLE', 'OFFLINE'][Math.floor(rng() * 3)] }) });
    if (i > 0 && rng() < 0.15) [events[i - 1], events[i]] = [events[i], events[i - 1]];
  }
  return events;
}
