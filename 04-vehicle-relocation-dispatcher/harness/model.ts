export interface Zone { zoneId: string; latitude: number; longitude: number; targetVehicles: number }
export interface Vehicle { vehicleId: string; zoneId: string; batteryPercentage: number; status: 'AVAILABLE' | 'IN_USE' | 'MAINTENANCE' }
export interface Request { requestId: string; zones: Zone[]; vehicles: Vehicle[]; constraints: { maxRelocations: number; minBatteryPercentage: number; maxRelocationDistanceKm: number } }
export interface Move { vehicleId: string; fromZone: string; toZone: string }
export interface Plan { requestId: string; relocations: Move[] }
export const DISTANCE_TOLERANCE_KM = 1e-9;
// Fail harness defects before launching participant code.
export function assertRequest(r: Request): void {
  const check = (ok: boolean, message: string) => { if (!ok) throw new Error(`Invalid harness request: ${message}`); };
  const id = (value: unknown) => typeof value === 'string' && value.length > 0;
  const finite = (n: number, min: number, max: number) => Number.isFinite(n) && n >= min && n <= max;
  const natural = (n: number) => Number.isSafeInteger(n) && n >= 0;
  check(id(r.requestId), 'requestId');
  const zones = new Set<string>(), vehicles = new Set<string>();
  for (const z of r.zones) {
    check(id(z.zoneId) && !zones.has(z.zoneId), 'duplicate or empty zone ID'); zones.add(z.zoneId);
    check(finite(z.latitude,-90,90) && finite(z.longitude,-180,180), `coordinates of ${z.zoneId}`);
    check(natural(z.targetVehicles), `target of ${z.zoneId}`);
  }
  for (const v of r.vehicles) {
    check(id(v.vehicleId) && !vehicles.has(v.vehicleId), 'duplicate or empty vehicle ID'); vehicles.add(v.vehicleId);
    check(zones.has(v.zoneId), `zone of ${v.vehicleId}`);
    check(finite(v.batteryPercentage,0,100), `battery of ${v.vehicleId}`);
    check(['AVAILABLE','IN_USE','MAINTENANCE'].includes(v.status), `status of ${v.vehicleId}`);
  }
  check(natural(r.constraints.maxRelocations), 'maxRelocations');
  check(finite(r.constraints.minBatteryPercentage,0,100), 'minBatteryPercentage');
  check(finite(r.constraints.maxRelocationDistanceKm,0,Number.MAX_VALUE), 'maxRelocationDistanceKm');
}
export function distance(a: Zone, b: Zone): number {
  const rad = Math.PI / 180;
  const h = Math.sin((b.latitude-a.latitude)*rad/2)**2 + Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin((b.longitude-a.longitude)*rad/2)**2;
  return 6371 * 2 * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}
export function inventory(r: Request): Map<string, number> {
  const counts = new Map(r.zones.map(z => [z.zoneId, 0]));
  for (const v of r.vehicles) if (v.status === 'AVAILABLE') counts.set(v.zoneId, counts.get(v.zoneId)! + 1);
  return counts;
}
export function shortage(r: Request, counts: Map<string, number>): number {
  return r.zones.reduce((sum,z) => sum + Math.max(0,z.targetVehicles-counts.get(z.zoneId)!),0);
}
export function score(initial: number, final: number, km: number, maxKm: number): number {
  if (initial === 0) return 100;
  const reduction = initial-final;
  const efficiency = reduction === 0 ? 0 : (maxKm === 0 ? 1 : Math.max(0,1-km/(reduction*maxKm)));
  return 100 * (reduction + 0.5*efficiency)/(initial+0.5);
}
export function validate(r: Request, output: unknown) {
  const fail = (message: string): never => { throw new Error(message); };
  if (!output || typeof output !== 'object' || Array.isArray(output)) fail('Output must be a JSON object');
  const p = output as Plan;
  if (p.requestId !== r.requestId) fail(`requestId must equal ${r.requestId}`);
  if (!Array.isArray(p.relocations)) fail('relocations must be an array');
  if (p.relocations.length > r.constraints.maxRelocations) fail(`Plan has ${p.relocations.length} moves; maximum is ${r.constraints.maxRelocations}`);
  const zones = new Map(r.zones.map(z=>[z.zoneId,z]));
  const vehicles = new Map(r.vehicles.map(v=>[v.vehicleId,v]));
  const counts = inventory(r), initialShortage = shortage(r,counts), used = new Set<string>();
  let totalDistanceKm = 0;
  for (const [i,m] of p.relocations.entries()) {
    const bad = (s: string): never => fail(`relocations[${i}]: ${s}`);
    if (!m || typeof m !== 'object' || Array.isArray(m) || ['vehicleId','fromZone','toZone'].some(k=>typeof (m as any)[k] !== 'string')) bad('requires string vehicleId, fromZone, toZone');
    const v = vehicles.get(m.vehicleId), from = zones.get(m.fromZone), to = zones.get(m.toZone);
    if (!v) bad(`unknown vehicle ${m.vehicleId}`);
    if (!from || !to) bad(`unknown zone (${m.fromZone} -> ${m.toZone})`);
    if (used.has(m.vehicleId)) bad(`vehicle ${m.vehicleId} already relocated`);
    if (v!.zoneId !== m.fromZone) bad(`vehicle ${m.vehicleId} belongs to ${v!.zoneId}`);
    if (m.fromZone === m.toZone) bad('source and destination must differ');
    if (v!.status !== 'AVAILABLE') bad(`vehicle ${m.vehicleId} is ${v!.status}`);
    if (v!.batteryPercentage < r.constraints.minBatteryPercentage) bad(`battery ${v!.batteryPercentage} below minimum ${r.constraints.minBatteryPercentage}`);
    if (counts.get(m.fromZone)! <= from!.targetVehicles) bad(`source ${m.fromZone} cannot preserve target ${from!.targetVehicles}`);
    if (counts.get(m.toZone)! >= to!.targetVehicles) bad(`destination ${m.toZone} is not below target`);
    const km = distance(from!,to!);
    if (km > r.constraints.maxRelocationDistanceKm + DISTANCE_TOLERANCE_KM) bad(`distance ${km.toPrecision(16)} km exceeds ${r.constraints.maxRelocationDistanceKm} km (tolerance ${DISTANCE_TOLERANCE_KM})`);
    counts.set(m.fromZone,counts.get(m.fromZone)!-1); counts.set(m.toZone,counts.get(m.toZone)!+1);
    totalDistanceKm += km; used.add(m.vehicleId);
  }
  const finalShortage = shortage(r,counts);
  return { initialShortage, finalShortage, shortageReduction: initialShortage-finalShortage, totalDistanceKm, score: score(initialShortage,finalShortage,totalDistanceKm,r.constraints.maxRelocationDistanceKm), zoneShortages: Object.fromEntries(r.zones.map(z=>[z.zoneId,Math.max(0,z.targetVehicles-counts.get(z.zoneId)!)])) };
}
