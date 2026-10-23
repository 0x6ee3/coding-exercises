import { idle, simulate, type Scenario } from "./model.js";

export function generate(seed: string, index: number): Scenario {
  if (!Number.isSafeInteger(index) || index < 0) throw new Error("Case index must be a nonnegative safe integer");
  let state = 2166136261;
  for (const c of seed + ":" + index) state = Math.imul(state ^ c.charCodeAt(0), 16777619);
  const random = () => { state += 0x6D2B79F5; let t = state; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const round = (n: number) => Math.round(n * 10000) / 10000;
  const capacity = [5, 8, 10, 13.5, 20][index % 5];
  const edge = index % 12;
  const min = edge === 8 ? 0 : capacity * 0.1, max = edge === 9 ? capacity * 0.9 : capacity;
  const mode = index % 6;
  const pvPeak = [6, 2.5, 1.1, 8, 4, 0.4][mode];
  const s: Scenario = {
    requestId: `energy-${index}-${seed}`,
    battery: { capacityKWh: capacity, minChargeKWh: min, maxChargeKWh: max,
      initialChargeKWh: edge === 6 ? min : edge === 7 ? max : round(min + (max - min) * (mode === 0 ? 0.02 : mode === 1 ? 0.98 : 0.2 + random() * 0.6)),
      maxChargeRateKW: round(1.5 + random() * 3), maxDischargeRateKW: round(1.5 + random() * 3),
      chargeEfficiency: edge === 10 ? 1 : round(0.85 + random() * 0.15), dischargeEfficiency: edge === 11 ? 1 : round(0.85 + random() * 0.15) },
    grid: { maxImportKW: 0, maxExportKW: 0 },
    hours: Array.from({length: 24}, (_, hour) => ({
      hour,
      solarGenerationKWh: round(pvPeak * Math.max(0, Math.sin((hour - (mode === 2 ? 8 : 6)) * Math.PI / (mode === 2 ? 8 : 12))) * (hour > (mode === 2 ? 16 : 18) ? 0 : 0.65 + random() * 0.35)),
      consumptionKWh: round(0.3 + random() * 0.6 + (hour >= 17 && hour <= 21 ? 1.4 : hour >= 6 && hour <= 8 ? 0.8 : 0)),
      purchasePrice: round(mode === 3 && hour >= 10 && hour <= 14 ? -0.12 + random() * 0.05 : 0.12 + random() * 0.09 + (hour >= 17 && hour <= 21 ? 0.35 : 0)),
      feedInPrice: round(mode === 4 && hour >= 10 && hour <= 14 ? -0.03 : 0.04 + random() * 0.05)
    }))
  };
  // Idle is a constructive feasibility witness, including the terminal constraint.
  s.grid.maxImportKW = round(Math.max(...s.hours.map(h => h.consumptionKWh - h.solarGenerationKWh), 0) + 0.1 + random());
  s.grid.maxExportKW = round(Math.max(...s.hours.map(h => h.solarGenerationKWh - h.consumptionKWh), 0) + 0.1 + random());
  if (edge === 8) s.grid.maxImportKW = Math.max(0, ...s.hours.map(h => h.consumptionKWh - h.solarGenerationKWh));
  if (edge === 9) s.grid.maxExportKW = Math.max(0, ...s.hours.map(h => h.solarGenerationKWh - h.consumptionKWh));
  if (!simulate(s, idle(s)).valid) throw new Error("Generator produced infeasible baseline");
  return s;
}

