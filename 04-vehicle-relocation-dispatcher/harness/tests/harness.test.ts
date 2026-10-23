import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertRequest, distance, score, validate, type Request, type Plan } from '../model.ts';
import { generate, profiles } from '../generate.ts';
import { baseline } from '../baseline.ts';
import { run } from '../runner.ts';
const fixture = (): Request => ({requestId:'test',zones:[{zoneId:'A',latitude:0,longitude:0,targetVehicles:1},{zoneId:'B',latitude:0,longitude:0.01,targetVehicles:2},{zoneId:'C',latitude:0,longitude:0.01,targetVehicles:2}],vehicles:[1,2,3].map(i=>({vehicleId:`V${i}`,zoneId:'A',batteryPercentage:30,status:'AVAILABLE'})),constraints:{maxRelocations:2,minBatteryPercentage:30,maxRelocationDistanceKm:10}});
const plan = (...ids: string[]): Plan => ({requestId:'test',relocations:ids.map(vehicleId=>({vehicleId,fromZone:'A',toZone:'B'}))});
test('Haversine known distances, symmetry, zero, antipodes',()=>{
  const [a,b]=fixture().zones;
  assert.ok(Math.abs(distance(a,b)-1.1119492664455874)<1e-12);
  assert.equal(distance(a,a),0); assert.equal(distance(a,b),distance(b,a));
  assert.ok(Math.abs(distance(a,{...a,longitude:180})-Math.PI*6371)<1e-8);
});
test('hand-calculated inventory and score',()=>{
  const result=validate(fixture(),plan('V1','V2'));
  assert.equal(result.initialShortage,4); assert.equal(result.finalShortage,2);
  assert.deepEqual(result.zoneShortages,{A:0,B:0,C:2});
  assert.ok(Math.abs(result.totalDistanceKm-2.223898532891175)<1e-12);
  // Reduction 2, mean distance 1.111949 km, efficiency .8888050734.
  assert.ok(Math.abs(result.score-54.32005637061601)<1e-10);
  assert.equal(validate(fixture(),plan()).score,0);
  assert.equal(score(0,0,0,10),100);
  assert.equal(score(2,0,0,10),100);
  assert.equal(score(2,0,20,10),80);
  assert.equal(score(2,1,0,10),60);
  assert.equal(score(2,0,0,0),100);
  for(let initial=1;initial<20;initial++) for(let reduction=0;reduction<initial;reduction++)
    assert.ok(score(initial,initial-reduction,0,10)<score(initial,initial-reduction-1,(reduction+1)*10,10));
});
test('schema and every business rule produce diagnostics',()=>{
  const check=(modify: (r: Request,p: any)=>void, pattern: RegExp)=>{
    const r=fixture(),p=plan('V1'); modify(r,p); assert.throws(()=>validate(r,p),pattern);
  };
  for(const invalid of [null,[],4,'x']) assert.throws(()=>validate(fixture(),invalid),/object/);
  check((r,p)=>p.requestId='wrong',/requestId/);
  check((r,p)=>p.relocations=null,/array/);
  check((r,p)=>p.relocations=[null],/requires string/);
  check((r,p)=>p.relocations[0].vehicleId=1,/requires string/);
  check((r,p)=>p.relocations[0].vehicleId='missing',/unknown vehicle/);
  check((r,p)=>p.relocations[0].toZone='missing',/unknown zone/);
  check((r,p)=>p.relocations[0].fromZone='missing',/unknown zone/);
  check((r,p)=>p.relocations[0].fromZone='C',/belongs to/);
  check((r,p)=>p.relocations[0].toZone='A',/must differ/);
  check((r,p)=>r.vehicles[0].status='IN_USE',/is IN_USE/);
  check((r,p)=>r.vehicles[0].batteryPercentage=29,/battery/);
  check((r,p)=>r.constraints.maxRelocationDistanceKm=1,/distance/);
  check((r,p)=>r.constraints.maxRelocations=0,/maximum/);
  check((r,p)=>r.zones[0].targetVehicles=3,/preserve target/);
  check((r,p)=>r.zones[1].targetVehicles=0,/not below target/);
  check((r,p)=>p.relocations=plan('V1','V1').relocations,/already relocated/);
  check((r,p)=>{r.zones[1].targetVehicles=1;p.relocations=plan('V1','V2').relocations;},/not below target/);
  check((r,p)=>{r.zones[0].targetVehicles=2;p.relocations=plan('V1','V2').relocations;},/preserve target/);
});
test('AVAILABLE inventory includes low batteries and excludes unavailable vehicles',()=>{
  const r=fixture(); r.vehicles[1].batteryPercentage=0; r.vehicles[2].status='MAINTENANCE';
  assert.equal(validate(r,plan('V1')).shortageReduction,1);
  r.vehicles[1].status='IN_USE'; assert.throws(()=>validate(r,plan('V1')),/preserve target/);
});
test('exact distance boundary and colocated distinct zones',()=>{
  const r=fixture();r.constraints.maxRelocationDistanceKm=distance(r.zones[0],r.zones[1]); validate(r,plan('V1'));
  r.zones[1].longitude=0;r.constraints.maxRelocationDistanceKm=0; assert.equal(validate(r,plan('V1')).totalDistanceKm,0);
});
test('alternative destinations accepted independently of reference',()=>{
  const r=fixture(),p=plan('V1','V2');p.relocations.forEach(m=>m.toZone='C');
  assert.deepEqual(validate(r,p).score,validate(r,plan('V1','V2')).score);
});
test('generated inputs and edge profile properties hold across seeds',()=>{
  for (const seed of [0,1,7,42,65535,4294967295]) {
    const cases=generate(seed,profiles.length);
    cases.forEach(assertRequest);
    const get=(name: string)=>cases.find(r=>r.requestId.endsWith(`-${name}`))!;
    const ties=get('ties');assert.equal(distance(ties.zones[0],ties.zones[1]),distance(ties.zones[0],ties.zones[2]));
    for(const name of ['zero-limit','all-low','all-unavailable','no-fleet']) assert.equal(baseline(get(name)).relocations.length,0);
    for(const name of ['threshold','distance-boundary','dateline','polar','colocated','zero-target','shuffled']) assert.ok(baseline(get(name)).relocations.length>0,name);
    const empty=get('empty');assert.equal(validate(empty,{requestId:empty.requestId,relocations:[]}).score,100);
  }
  for(const mutate of [
    (r: Request)=>r.zones.push({...r.zones[0]}),
    (r: Request)=>r.vehicles.push({...r.vehicles[0]}),
    (r: Request)=>r.vehicles[0].zoneId='missing',
    (r: Request)=>r.zones[0].latitude=NaN,
    (r: Request)=>r.zones[0].targetVehicles=-1,
    (r: Request)=>r.vehicles[0].batteryPercentage=101,
    (r: Request)=>r.constraints.maxRelocations=0.5,
    (r: Request)=>r.constraints.maxRelocationDistanceKm=Infinity
  ]) {const r=fixture();mutate(r);assert.throws(()=>assertRequest(r),/Invalid harness request/);}
});
test('invalid plans cannot receive a score even in zero-shortage cases',()=>{
  const r=fixture();r.zones.forEach(z=>z.targetVehicles=0);
  assert.throws(()=>validate(r,plan('V1')),/not below target/);
  assert.throws(()=>validate(r,{requestId:r.requestId,relocations:[{vehicleId:'missing',fromZone:'A',toZone:'B'}]}),/unknown vehicle/);
});
test('IDs are opaque and inputs are not mutated by validation or reference',()=>{
  for(const r of generate(7,24)) {
    const before=structuredClone(r), p=baseline(r);
    validate(r,p);assert.deepEqual(r,before);
  }
});
test('seeded generators and reference stay deterministic and valid at scale',()=>{
  assert.deepEqual(generate(42,24),generate(42,24)); assert.notDeepEqual(generate(42,1),generate(43,1));
  for(const seed of [0,1,42,4294967295]) for(const r of generate(seed,24)) {
    const p=baseline(r); assert.deepEqual(p,baseline(r)); const result=validate(r,p);
    assert.ok(result.score>=0 && result.score<=100);
    assert.equal(result.shortageReduction,p.relocations.length);
    assert.equal(validate(r,{requestId:r.requestId,relocations:[]}).shortageReduction,0);
    if(r.requestId.endsWith('-large')) {assert.equal(r.zones.length,300); assert.ok(r.vehicles.length>=1000);}
    if(r.requestId.endsWith('-balanced')) assert.equal(result.initialShortage,0);
    if(r.requestId.endsWith('-impossible')) assert.equal(p.relocations.length,0);
  }
});
const command = (code: string) => `"${process.execPath}" -e "${code}"`;
test('runner handles multiple JSONL requests, split writes and stderr',async()=>{
  const code="const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',l=>{const r=JSON.parse(l);console.error('debug');const s=JSON.stringify({requestId:r.requestId,relocations:[]});process.stdout.write(s.slice(0,3));setTimeout(()=>process.stdout.write(s.slice(3)+'\\n'),5)})";
  const requests=generate(1,3);const result=await run(command(code),requests,3000);
  result.forEach((p,i)=>validate(requests[i],p));
});
test('runner rejects malformed, early exit, extra output, timeout and nonzero exit',async()=>{
  for(const [code,pattern] of [
    ["console.log('bad')",/Invalid JSON/],
    ["process.exit(0)",/exited|stdin/],
    ["console.log('{}\\n{}')",/extra/],
    ["process.exit(7)",/code 7|stdin/],
    ["process.stdout.write('x'.repeat(2200000))",/limit/]
  ] as const) await assert.rejects(run(command(code),[fixture()],5000),pattern);
  await assert.rejects(run(command('setInterval(()=>{},1000)'),[fixture()],200),/Timeout/);
});
test('runner accepts UTF-8, CRLF, large requests, and delayed shutdown',async()=>{
  const code="const rl=require('node:readline').createInterface({input:process.stdin});rl.on('line',l=>{const r=JSON.parse(l);const s=Buffer.from(JSON.stringify({requestId:r.requestId,relocations:[]})+'\\r\\n');for(const b of s)process.stdout.write(Buffer.from([b]));});rl.on('close',()=>setTimeout(()=>process.exit(0),20));";
  const requests=[{...fixture(),requestId:'城市 🚗'},generate(1,12)[11]];
  const results=await run(command(code),requests,5000);results.forEach((p,i)=>validate(requests[i],p));
});
test('runner rejects blank lines, missing newline, extra partial output, and hanging exit',async()=>{
  for(const [code,pattern] of [
    ["console.log('')",/Invalid JSON/],
    ["process.stdout.write('{}')",/newline/],
    ["process.stdout.write('{}\\nx')",/extra/],
    ["console.log('{}');setInterval(()=>{},1000)",/participant exit/]
  ] as const) await assert.rejects(run(command(code),[fixture()],5000),pattern);
});
