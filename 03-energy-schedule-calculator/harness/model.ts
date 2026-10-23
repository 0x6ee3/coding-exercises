export const EPS = 1e-7;
export const COST_EPS = 1e-6;
export interface Scenario {
  requestId: string;
  battery: {
    capacityKWh: number; initialChargeKWh: number; minChargeKWh: number; maxChargeKWh: number;
    maxChargeRateKW: number; maxDischargeRateKW: number; chargeEfficiency: number; dischargeEfficiency: number;
  };
  grid: { maxImportKW: number; maxExportKW: number };
  hours: { hour: number; solarGenerationKWh: number; consumptionKWh: number; purchasePrice: number; feedInPrice: number }[];
}
export interface Action { hour: number; batteryAction: "CHARGE" | "DISCHARGE" | "IDLE"; batteryEnergyKWh: number }
export const idle = (s: Scenario) => ({ requestId: s.requestId, schedule: s.hours.map(h => ({ hour: h.hour, batteryAction: "IDLE", batteryEnergyKWh: 0 })) });
export const cost = (grid: number, h: Scenario["hours"][number]) => Math.max(grid, 0) * h.purchasePrice - Math.max(-grid, 0) * h.feedInPrice;

export function simulate(s: Scenario, response: unknown) {
  const violations: string[] = [];
  const rows: { hour: number; socKWh: number; gridEnergyKWh: number; cost: number }[] = [];
  const fail = (message: string) => { violations.push(message); };
  if (!response || typeof response !== "object" || Array.isArray(response)) {
    return { valid: false, totalCost: null, violations: ["Response must be an object"], rows };
  }
  const r = response as Record<string, unknown>;
  if (r.requestId !== s.requestId) fail("requestId must match");
  if (!Array.isArray(r.schedule) || r.schedule.length !== 24) {
    fail("schedule must contain exactly 24 actions");
    return { valid: false, totalCost: null, violations, rows };
  }
  // Reject the whole malformed schedule before doing arithmetic.
  r.schedule.forEach((a: unknown, i: number) => {
    if (!a || typeof a !== "object" || Array.isArray(a)) { fail(`Hour ${i}: action must be an object`); return; }
    const v = a as Record<string, unknown>;
    if (v.hour !== i) fail(`Hour ${i}: hour must equal array index`);
    if (!["CHARGE", "DISCHARGE", "IDLE"].includes(v.batteryAction as string)) fail(`Hour ${i}: unknown action`);
    if (typeof v.batteryEnergyKWh !== "number" || !Number.isFinite(v.batteryEnergyKWh) || v.batteryEnergyKWh < 0) fail(`Hour ${i}: energy must be finite and nonnegative`);
    if (v.batteryAction === "IDLE" && v.batteryEnergyKWh !== 0) fail(`Hour ${i}: IDLE energy must be exactly zero`);
  });
  if (violations.length) return { valid: false, totalCost: null, violations, rows };
  let soc = s.battery.initialChargeKWh, totalCost = 0;
  const b = s.battery;
  (r.schedule as Action[]).forEach((a, i) => {
    const charge = a.batteryAction === "CHARGE" ? a.batteryEnergyKWh : 0;
    const discharge = a.batteryAction === "DISCHARGE" ? a.batteryEnergyKWh : 0;
    soc += charge * b.chargeEfficiency - discharge / b.dischargeEfficiency;
    const grid = s.hours[i].consumptionKWh - s.hours[i].solarGenerationKWh + charge - discharge;
    if (charge > b.maxChargeRateKW + EPS) fail(`Hour ${i}: charge rate exceeded`);
    if (discharge > b.maxDischargeRateKW + EPS) fail(`Hour ${i}: discharge rate exceeded`);
    if (soc < b.minChargeKWh - EPS || soc > b.maxChargeKWh + EPS) fail(`Hour ${i}: state of charge outside bounds`);
    if (grid > s.grid.maxImportKW + EPS) fail(`Hour ${i}: grid import exceeded`);
    if (grid < -s.grid.maxExportKW - EPS) fail(`Hour ${i}: grid export exceeded`);
    const hourlyCost = cost(grid, s.hours[i]);
    totalCost += hourlyCost;
    rows.push({ hour: i, socKWh: soc, gridEnergyKWh: grid, cost: hourlyCost });
  });
  if (soc < b.initialChargeKWh - EPS) fail("Final state of charge below initial charge");
  if (!Number.isFinite(totalCost) || rows.some(r => !Number.isFinite(r.socKWh) || !Number.isFinite(r.gridEnergyKWh))) fail("Non-finite simulation result");
  return { valid: !violations.length, totalCost: Number.isFinite(totalCost) ? totalCost : null, violations, rows };
}

export function score(total: number, baseline: number, benchmark: number, valid = true) {
  if (!valid || ![total, baseline, benchmark].every(Number.isFinite)) return 0;
  const gap = baseline - benchmark;
  if (gap <= COST_EPS) return total <= baseline + COST_EPS ? 100 : 0;
  return Math.max(0, Math.min(100, 100 * (baseline - total) / gap));
}

// Internal approximate benchmark: shortest path over a fixed state-of-charge lattice.
export function benchmark(s: Scenario, steps = 100): number {
  if (!Number.isInteger(steps) || steps < 1) throw new Error("steps must be a positive integer");
  const b = s.battery;
  const states = [...new Set(Array.from({length: steps + 1}, (_, i) => b.minChargeKWh + (b.maxChargeKWh - b.minChargeKWh) * i / steps).concat(b.initialChargeKWh))].sort((a, b) => a - b);
  let dp = states.map(v => v === b.initialChargeKWh ? 0 : Infinity);
  for (const h of s.hours) {
    const next = states.map(() => Infinity);
    for (let i = 0; i < states.length; i++) {
      if (!Number.isFinite(dp[i])) continue;
      for (let j = 0; j < states.length; j++) {
        const delta = states[j] - states[i];
        const charge = delta > 0 ? delta / b.chargeEfficiency : 0;
        const discharge = delta < 0 ? -delta * b.dischargeEfficiency : 0;
        const grid = h.consumptionKWh - h.solarGenerationKWh + charge - discharge;
        // Strict bounds ensure every benchmark path is physically feasible.
        if (charge > b.maxChargeRateKW || discharge > b.maxDischargeRateKW || grid > s.grid.maxImportKW || grid < -s.grid.maxExportKW) continue;
        next[j] = Math.min(next[j], dp[i] + cost(grid, h));
      }
    }
    dp = next;
  }
  const result = Math.min(...dp.filter((_, i) => states[i] >= b.initialChargeKWh));
  if (!Number.isFinite(result)) throw new Error("No feasible benchmark path");
  return result;
}

