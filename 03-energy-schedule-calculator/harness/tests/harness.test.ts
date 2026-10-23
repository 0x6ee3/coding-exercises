import test from "node:test";
import assert from "node:assert/strict";
import { generate } from "../generator.js";
import { benchmark, COST_EPS, EPS, idle, score, simulate, type Action, type Scenario } from "../model.js";
import { runParticipant } from "../runner.js";

function fixture(): Scenario {
  return { requestId: "manual", battery: { capacityKWh: 10, initialChargeKWh: 2, minChargeKWh: 0, maxChargeKWh: 10, maxChargeRateKW: 4, maxDischargeRateKW: 4, chargeEfficiency: 0.8, dischargeEfficiency: 0.5 }, grid: { maxImportKW: 10, maxExportKW: 10 }, hours: Array.from({length:24}, (_, hour) => ({ hour, solarGenerationKWh: 0, consumptionKWh: 0, purchasePrice: 0.2, feedInPrice: 0.1 })) };
}
function actions(s: Scenario) { return idle(s) as {requestId: string; schedule: Action[]}; }
const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("hand calculation: AC losses, import/export, terminal charge, and idle", () => {
  const s = fixture(), r = actions(s);
  r.schedule[0] = {hour:0, batteryAction:"CHARGE", batteryEnergyKWh:2.5};
  r.schedule[1] = {hour:1, batteryAction:"DISCHARGE", batteryEnergyKWh:1};
  const result = simulate(s, r);
  assert.equal(result.valid, true);
  close(result.rows[0].socKWh, 4); close(result.rows[1].socKWh, 2);
  close(result.rows[0].cost, 0.5); close(result.rows[1].cost, -0.1);
  close(result.totalCost!, 0.4);
});
test("hand calculation: solar revenue, negative purchase and feed-in prices", () => {
  const s = fixture();
  s.hours[0] = {hour:0, solarGenerationKWh:3, consumptionKWh:1, purchasePrice:0.3, feedInPrice:0.08};
  s.hours[1] = {hour:1, solarGenerationKWh:0, consumptionKWh:2, purchasePrice:-0.1, feedInPrice:0};
  s.hours[2] = {hour:2, solarGenerationKWh:1, consumptionKWh:0, purchasePrice:0.2, feedInPrice:-0.05};
  close(simulate(s, idle(s)).totalCost!, -0.31);
});
test("grading including invalid, worse than idle, better than benchmark, and no gap", () => {
  close(score(8,10,6),50); close(score(10,10,6),0); close(score(12,10,6),0);
  close(score(5,10,6),100); close(score(6,10,6,false),0);
  close(score(-3,-2,-4),50); close(score(10,10,10),100); close(score(11,10,10),0);
  close(score(10 + COST_EPS / 2,10,10),100);
});
test("reject malformed responses", () => {
  const s = fixture();
  for (const v of [null, [], {}, {...idle(s), requestId:"wrong"}, {...idle(s), schedule:[] }]) assert.equal(simulate(s,v).valid,false);
  for (const patch of [{hour:1},{batteryAction:"FLY"},{batteryEnergyKWh:-1},{batteryEnergyKWh:Infinity},{batteryEnergyKWh:NaN},{batteryEnergyKWh:"1"},{batteryEnergyKWh:0.000000001}]) {
    const r = actions(s); Object.assign(r.schedule[0],patch); assert.equal(simulate(s,r).valid,false);
  }
});
test("detect every physical constraint and terminal depletion", () => {
  for (const [action, energy, change, text] of [
    ["CHARGE",5,()=>{}, "charge rate"],
    ["DISCHARGE",5,()=>{}, "discharge rate"],
    ["CHARGE",2,(s:Scenario)=>{s.battery.maxChargeKWh=3;}, "state of charge"],
    ["DISCHARGE",2,()=>{}, "state of charge"],
    ["CHARGE",2,(s:Scenario)=>{s.grid.maxImportKW=1;}, "grid import"],
    ["DISCHARGE",0.5,(s:Scenario)=>{s.grid.maxExportKW=0;}, "grid export"],
    ["DISCHARGE",0.5,()=>{}, "Final state"]
  ] as const) {
    const s=fixture(), r=actions(s); change(s);
    r.schedule[0]={hour:0,batteryAction:action,batteryEnergyKWh:energy};
    assert.ok(simulate(s,r).violations.some(v=>v.includes(text)),text);
  }
});
test("physical tolerances are absolute and enforced", () => {
  const s=fixture(), r=actions(s); s.battery.chargeEfficiency=1; s.battery.maxChargeRateKW=1;
  r.schedule[0]={hour:0,batteryAction:"CHARGE",batteryEnergyKWh:1+EPS/2};
  assert.equal(simulate(s,r).valid,true);
  r.schedule[0].batteryEnergyKWh=1+EPS*2;
  assert.equal(simulate(s,r).valid,false);
});
test("benchmark hand calculation: exact optimum on a unit lattice", () => {
  const s=fixture();
  Object.assign(s.battery,{capacityKWh:1,maxChargeKWh:1,initialChargeKWh:0,maxChargeRateKW:1,maxDischargeRateKW:1,chargeEfficiency:1,dischargeEfficiency:1});
  s.hours.forEach(h=>{h.purchasePrice=1;h.feedInPrice=0;});
  s.hours[0].purchasePrice=0.1; s.hours[1].consumptionKWh=1;
  close(simulate(s,idle(s)).totalCost!,1);
  close(benchmark(s,1),0.1);
  s.hours[0].purchasePrice=-0.2;
  close(benchmark(s,1),-0.2);
});
test("generator deterministic, diverse, feasible; benchmark never worse than baseline", () => {
  const modes=new Set<number>();
  for(let i=0;i<30;i++){
    const s=generate("fixed",i);
    assert.deepEqual(s,generate("fixed",i));
    assert.notDeepEqual(s,generate("other",i));
    assert.equal(s.hours.length,24);
    assert.equal(simulate(s,idle(s)).valid,true);
    assert.ok(benchmark(s,30)<=simulate(s,idle(s)).totalCost!+1e-9);
    modes.add(s.battery.capacityKWh);
  }
  assert.equal(modes.size,5);
});
test("runner handles a JSONL subprocess, invalid JSON, exit and timeout", async () => {
  // These fixtures test transport only; they contain no scheduling logic.
  assert.deepEqual(await runParticipant('node -e "process.stdout.write(JSON.stringify({ok:true})+String.fromCharCode(10))"',fixture(),5000),{ok:true});
  assert.equal(await runParticipant('node -e "console.log(123)"',fixture(),5000),123);
  await assert.rejects(runParticipant('node -e "console.log(\'bad\')"',fixture(),5000),/not valid JSON/);
  await assert.rejects(runParticipant('node -e "process.exit(0)"',fixture(),5000),/without a complete/);
  await assert.rejects(runParticipant('node -e "setInterval(()=>{},1000)"',fixture(),100),/Timeout/);
});


test("all generated numeric input invariants, including exact boundary cases", () => {
  for (const seed of ["", "unicode-日-😀", "alternate"]) for (let i=0;i<60;i++) {
    const s=generate(seed,i), b=s.battery;
    assert.ok(b.minChargeKWh>=0 && b.minChargeKWh<=b.initialChargeKWh && b.initialChargeKWh<=b.maxChargeKWh && b.maxChargeKWh<=b.capacityKWh);
    assert.ok(b.chargeEfficiency>0 && b.chargeEfficiency<=1 && b.dischargeEfficiency>0 && b.dischargeEfficiency<=1);
    assert.ok(s.grid.maxImportKW>=0 && s.grid.maxExportKW>=0);
    for(const h of s.hours) {
      assert.ok(Object.values(h).every(Number.isFinite));
      assert.ok(h.solarGenerationKWh>=0 && h.consumptionKWh>=0);
    }
    assert.equal(simulate(s,idle(s)).valid,true);
    assert.ok(benchmark(s,20)<=simulate(s,idle(s)).totalCost!+1e-9);
  }
  assert.equal(generate("edge",6).battery.initialChargeKWh,generate("edge",6).battery.minChargeKWh);
  assert.equal(generate("edge",7).battery.initialChargeKWh,generate("edge",7).battery.maxChargeKWh);
  assert.equal(generate("edge",10).battery.chargeEfficiency,1);
  assert.equal(generate("edge",11).battery.dischargeEfficiency,1);
});

test("zero limits, locked battery, and final-hour violations", () => {
  const s=fixture(); Object.assign(s.battery,{minChargeKWh:2,maxChargeKWh:2,maxChargeRateKW:0,maxDischargeRateKW:0});
  s.grid={maxImportKW:0,maxExportKW:0};
  assert.equal(simulate(s,idle(s)).valid,true);
  close(benchmark(s),0);
  const r=actions(s); r.schedule[23]={hour:23,batteryAction:"CHARGE",batteryEnergyKWh:1};
  const result=simulate(s,r);
  assert.equal(result.valid,false);
  assert.equal(result.rows.length,24);
  assert.ok(result.violations.some(v=>v.includes("Hour 23")));
  const t=fixture(), depleted=actions(t);
  depleted.schedule[23]={hour:23,batteryAction:"DISCHARGE",batteryEnergyKWh:0.1};
  assert.ok(simulate(t,depleted).violations.some(v=>v.includes("Final")));
});

test("invalid or non-finite results cannot receive a score", () => {
  for(const x of [NaN,Infinity,-Infinity]) {
    assert.equal(score(x,10,5),0);
    assert.equal(score(8,x,5),0);
    assert.equal(score(8,10,x),0);
  }
});

test("benchmark preserves an off-lattice initial state and a zero-width range", () => {
  const s=fixture(); s.battery.initialChargeKWh=2.1234567;
  assert.ok(benchmark(s,3)<=simulate(s,idle(s)).totalCost!+1e-9);
  s.battery.minChargeKWh=s.battery.initialChargeKWh;
  s.battery.maxChargeKWh=s.battery.initialChargeKWh;
  close(benchmark(s,3),simulate(s,idle(s)).totalCost!);
});

test("transport result is independent of output chunking and exit timing", async () => {
  const command = (body:string) => 'node -e "'+body+'"';
  const s=fixture();
  for(const body of [
    "console.log(123);console.log(456)",
    "console.log(123);setTimeout(()=>console.log(456),100)"
  ]) await assert.rejects(runParticipant(command(body),s,5000),/one JSONL/);
  await assert.rejects(runParticipant(command("console.log(123);process.exitCode=7"),s,5000),/exited \(7\)/);
  await assert.rejects(runParticipant(command("process.stdout.write(String(123))"),s,5000),/complete JSONL/);
  await assert.rejects(runParticipant(command("console.log(123);setInterval(()=>{},1000)"),s,200),/Timeout/);
  assert.equal(await runParticipant(command("process.stdout.write(String(123));setTimeout(()=>process.stdout.write(String.fromCharCode(13,10)),100)"),s,5000),123);
  await assert.rejects(runParticipant(command("process.stdout.write(Buffer.from([255,10]))"),s,5000),/UTF-8/);
  await assert.rejects(runParticipant(command("process.stdout.write(String(1).repeat(1048577))"),s,5000),/1 MiB/);
});


test("default suite has meaningful optimization opportunities", () => {
  for(let i=0;i<12;i++) {
    const s=generate("energy",i);
    assert.ok(simulate(s,idle(s)).totalCost!-benchmark(s)>COST_EPS);
  }
});

test("CLI rejects ambiguous options before launching a participant", async () => {
  const {spawnSync}=await import("node:child_process");
  const {fileURLToPath}=await import("node:url");
  const cli=fileURLToPath(new URL("../cli.ts",import.meta.url));
  for(const args of [
    ["--case","0","--cases","1"],
    ["--case","0","--case","1"],
    ["--cases","10001"],
    ["--timeout","0"],
    ["--cases","1","--export-case","unused.json"]
  ]) {
    const result=spawnSync(process.execPath,["--import","tsx",cli,...args],{encoding:"utf8",timeout:10000});
    assert.equal(result.status,2,result.stderr);
    assert.equal(result.stdout,"");
  }
});
