import { assertRequest, distance, type Request } from './model.ts';
export const profiles = ['small','dense','rural','surplus','shortage','low-battery','unavailable','balanced','limit','impossible','ties','large', 'empty','no-fleet','zero-limit','colocated','threshold','distance-boundary','dateline','polar','all-low','all-unavailable','zero-target','shuffled'] as const;
export function generate(seed = 1, cases = 24): Request[] {
  let state = seed >>> 0;
  const random = () => { state = (Math.imul(state,1664525)+1013904223)>>>0; return state/4294967296; };
  const int = (n: number) => Math.floor(random()*n);
  return Array.from({length:cases},(_,index)=>{
    const profile = profiles[index%profiles.length];
    const n = profile==='large'?300:profile==='dense'?40:profile==='small'?3:12;
    const spread = profile==='rural'?2:profile==='dense'?0.025:0.1;
    const r: Request = {requestId:`seed-${seed}-case-${index}-${profile}`, zones:[], vehicles:[],constraints:{maxRelocations:profile==='limit'?1:profile==='balanced'?20:profile==='large'?500:30,minBatteryPercentage:30,maxRelocationDistanceKm:profile==='impossible'?0:profile==='rural'?5:15}};
    for (let z=0;z<n;z++) {
      const zoneId = `Z${z}`, targetVehicles = profile==='surplus'?2:profile==='shortage'?18:10;
      r.zones.push({zoneId,latitude:52.52+(random()-0.5)*spread,longitude:13.4+(random()-0.5)*spread,targetVehicles});
      const count = profile==='balanced'?targetVehicles:profile==='large'?(z%2===0?30:10):z%2===0?20+int(6):int(5);
      for (let v=0;v<count;v++) r.vehicles.push({vehicleId:`V${z}-${v}`,zoneId,batteryPercentage:profile==='low-battery'?int(35):int(101),status:profile==='balanced'?'AVAILABLE':profile==='unavailable'?(random()<0.85?'IN_USE':'AVAILABLE'):(random()<0.12?'MAINTENANCE':'AVAILABLE')});
    }
    if (profile==='ties') {
      r.zones = [{zoneId:'Z0',latitude:0,longitude:13,targetVehicles:1},{zoneId:'Z1',latitude:0.01,longitude:13,targetVehicles:2},{zoneId:'Z2',latitude:-0.01,longitude:13,targetVehicles:2}];
      r.vehicles = Array.from({length:4},(_,i)=>({vehicleId:`V${i}`,zoneId:'Z0',batteryPercentage:80,status:'AVAILABLE'}));
    }
    if (index%profiles.length>=12) {
      // Data fixtures only: no reference relocation lists.
      r.zones=[{zoneId:'__proto__',latitude:0,longitude:0,targetVehicles:1},{zoneId:'中心 / B',latitude:0,longitude:0.01,targetVehicles:2}];
      r.vehicles=Array.from({length:3},(_,i)=>({vehicleId:`car / ${i}`,zoneId:'__proto__',batteryPercentage:80,status:'AVAILABLE'}));
      if(profile==='empty') {r.zones=[];r.vehicles=[];}
      if(profile==='no-fleet') r.vehicles=[];
      if(profile==='zero-limit') r.constraints.maxRelocations=0;
      if(profile==='colocated') {r.zones[1].longitude=0;r.constraints.maxRelocationDistanceKm=0;}
      if(profile==='threshold') {r.vehicles[0].batteryPercentage=29.999;r.vehicles[1].batteryPercentage=30;r.vehicles[2].batteryPercentage=30.001;}
      if(profile==='distance-boundary') r.constraints.maxRelocationDistanceKm=distance(r.zones[0],r.zones[1]);
      if(profile==='dateline') {r.zones[0].longitude=179.99;r.zones[1].longitude=-179.99;}
      if(profile==='polar') {r.zones[0].latitude=89.99;r.zones[1].latitude=89.99;r.zones[1].longitude=90;}
      if(profile==='all-low') r.vehicles.forEach(v=>v.batteryPercentage=0);
      if(profile==='all-unavailable') r.vehicles.forEach((v,i)=>v.status=i%2?'IN_USE':'MAINTENANCE');
      if(profile==='zero-target') r.zones[0].targetVehicles=0;
      if(profile==='shuffled') {r.zones.reverse();r.vehicles.reverse();r.zones[0].targetVehicles=3;r.zones[1].targetVehicles=0;}
    }
    assertRequest(r);
    return r;
  });
}
