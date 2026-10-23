// Harness-only reference: deliberately kept out of participant/ and examples/.
import { distance, inventory, DISTANCE_TOLERANCE_KM, type Request, type Plan } from './model.ts';
const compareId = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
export function baseline(r: Request): Plan {
  const counts = inventory(r), used = new Set<string>(), relocations: Plan['relocations'] = [];
  const candidates = r.zones.flatMap(from=>r.zones.filter(to=>to.zoneId!==from.zoneId).map(to=>({from,to,km:distance(from,to)})))
    .filter(p=>p.km<=r.constraints.maxRelocationDistanceKm+DISTANCE_TOLERANCE_KM)
    .sort((a,b)=>a.km-b.km || compareId(a.from.zoneId,b.from.zoneId) || compareId(a.to.zoneId,b.to.zoneId));
  const eligible = new Map(r.zones.map(z=>[z.zoneId,r.vehicles.filter(v=>v.zoneId===z.zoneId && v.status==='AVAILABLE' && v.batteryPercentage>=r.constraints.minBatteryPercentage).sort((a,b)=>compareId(a.vehicleId,b.vehicleId))]));
  for (const {from,to} of candidates) {
    while (relocations.length<r.constraints.maxRelocations && counts.get(from.zoneId)!>from.targetVehicles && counts.get(to.zoneId)!<to.targetVehicles) {
      const v = eligible.get(from.zoneId)!.find(v=>!used.has(v.vehicleId));
      if (!v) break;
      relocations.push({vehicleId:v.vehicleId,fromZone:from.zoneId,toZone:to.zoneId}); used.add(v.vehicleId);
      counts.set(from.zoneId,counts.get(from.zoneId)!-1); counts.set(to.zoneId,counts.get(to.zoneId)!+1);
    }
  }
  return {requestId:r.requestId,relocations};
}
