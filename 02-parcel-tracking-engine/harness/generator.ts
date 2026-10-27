import type { Event, Request, Status } from './reference.ts';
export const categories = ['delivery', 'facilities', 'loops', 'out-of-order', 'duplicates', 'invalid-transitions', 'missing-created', 'after-terminal', 'scale', 'simultaneous', 'ties', 'boundaries', 'transition-matrix', 'empty'];
function random(seed: string) {
  let h = 2166136261;
  for (const c of String(seed)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => { h = (h + 0x6D2B79F5) | 0; let t = Math.imul(h ^ h >>> 15, 1 | h); t ^= t + Math.imul(t ^ t >>> 7, 61 | t); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function* generate(seed = '1', count = 32) {
  const rng = random(seed);
  for (let n = 0; n < count; n++) {
    const category = categories[n % categories.length], events: Event[] = [];
    const size = category === 'scale' ? 2500 : category === 'simultaneous' ? 30 : 2 + Math.floor(rng() * 4);
    for (let p = 0; p < size; p++) {
      let route: Status[] = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER'];
      if (category === 'loops') for (let j = 0; j < 2 + Math.floor(rng() * 5); j++) route.push('IN_TRANSIT', 'AT_SORTING_CENTER');
      route.push('OUT_FOR_DELIVERY', p % 2 ? 'RETURNED' : 'DELIVERED');
      if (category === 'missing-created') route.shift();
      if (category === 'invalid-transitions') route.splice(1, 0, 'DELIVERED', 'CREATED');
      if (category === 'after-terminal') route.push('IN_TRANSIT', 'CREATED', 'RETURNED');
      const base = Math.floor(rng() * 10000);
      route.forEach((type, i) => events.push({ eventId: `p${p}-e${String(i).padStart(3, '0')}`, parcelId: `P-${String(p).padStart(5, '0')}`, timestamp: category === 'ties' ? 100 : category === 'simultaneous' ? i * 100 : base + i * 100, type, facilityId: category === 'facilities' || category === 'loops' ? `F-${i}` : 'BER-01' }));
    }
    if (['out-of-order', 'simultaneous', 'ties', 'scale'].includes(category)) {
      for (let i = events.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [events[i], events[j]] = [events[j], events[i]]; }
    }
    if (category === 'duplicates') {
      const original = events[0];
      events.push({ ...original }, { ...original, parcelId: 'OTHER', type: 'RETURNED', timestamp: 0 });
    }
    if (category === 'ties') {
      // Lexical event ordering must be observable, including a rejected premature scan.
      events.push({ eventId: 'tie-2', parcelId: 'TIE', timestamp: 0, type: 'CREATED', facilityId: 'F' }, { eventId: 'tie-10', parcelId: 'TIE', timestamp: 0, type: 'PICKED_UP', facilityId: 'G' });
      // ASCII uppercase precedes lowercase; culture-sensitive collation can reverse them.
      // Arrival order is reversed too, so ignoring the event-ID tie-breaker also fails.
      events.push(
        { eventId: 'ordinal-a', parcelId: 'TIE-ORDINAL', timestamp: 0, type: 'PICKED_UP', facilityId: 'pickup' },
        { eventId: 'ordinal-A', parcelId: 'TIE-ORDINAL', timestamp: 0, type: 'CREATED', facilityId: 'create' },
      );
    }
    if (category === 'boundaries') {
      events.length = 0;
      for (const parcelId of ['z', 'A', 'a', '10', '2', '__proto__', 'constructor', ' P ', 'P', 'p', ' ']) {
        const e = (eventId: string, type: Status, timestamp: number) => ({ eventId: `${parcelId}-${eventId}`, parcelId, type, timestamp, facilityId: ` ${eventId} `, ignored: true });
        events.push(e('premature', 'IN_TRANSIT', 0), e('create', 'CREATED', 1), e('pickup', 'PICKED_UP', 9007199254740991));
      }
    }
    if (category === 'transition-matrix') {
      events.length = 0;
      const main: Status[] = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY'];
      const routes: Status[][] = [...main.map((_, i) => main.slice(0, i + 1)), [...main, 'DELIVERED'], [...main, 'RETURNED']];
      for (const route of routes) for (const target of [...main, 'DELIVERED', 'RETURNED'] as Status[]) {
        const parcelId = `${route.at(-1)}:${target}`;
        [...route, target].forEach((type, i) => events.push({ eventId: `${parcelId}:${i}`, parcelId, type, timestamp: i, facilityId: `F-${i}` }));
      }
    }
    if (category === 'empty') events.length = 0;
    const request: Request = { requestId: `case-${String(n).padStart(4, '0')}-${category}`, events };
    yield { category, request };
  }
}
