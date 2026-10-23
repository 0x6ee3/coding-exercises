import { writeFileSync } from "node:fs";
import { generate } from "./generator.js";
import { benchmark, idle, score, simulate } from "./model.js";
import { runParticipant } from "./runner.js";

async function main() {
  const args = process.argv.slice(2);
  const options: Record<string, string> = {};
  let verbose = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--verbose") { verbose = true; continue; }
    if (args[i] === "--help") {
      console.log('Usage: npm test -- --command "node participant/main.js" [--seed text] [--cases 12] [--case 0] [--timeout 2000] [--verbose] [--export-case scenario.json]');
      return;
    }
    if (!["--command", "--seed", "--cases", "--case", "--timeout", "--export-case"].includes(args[i]) || args[i + 1] === undefined || args[i + 1].startsWith("--")) throw new Error(`Unknown or incomplete option: ${args[i]}`);
    if (options[args[i]] !== undefined) throw new Error(`Duplicate option: ${args[i]}`);
    options[args[i]] = args[++i];
  }
  const integer = (key: string, fallback: number, min: number) => {
    const n = options[key] === undefined ? fallback : Number(options[key]);
    if (!Number.isSafeInteger(n) || n < min || n > 2147483647) throw new Error(`${key} must be an integer between ${min} and 2147483647`);
    return n;
  };
  if (options["--cases"] !== undefined && Number(options["--cases"]) > 10000) throw new Error("--cases must not exceed 10000");
  const count = integer("--cases", 12, 1), first = integer("--case", 0, 0), timeout = integer("--timeout", 2000, 1);
  if (options["--case"] !== undefined && options["--cases"] !== undefined) throw new Error("--case and --cases are mutually exclusive");
  const cases = options["--case"] === undefined ? Array.from({length: count}, (_, i) => i) : [first];
  if (options["--export-case"]) {
    if (options["--case"] === undefined) throw new Error("--export-case requires --case");
    writeFileSync(options["--export-case"], JSON.stringify(generate(options["--seed"] ?? "energy", first)) + "\n");
    console.log(`Exported case ${first}`);
    if (!options["--command"]) return;
  }
  if (!options["--command"]?.trim()) throw new Error("--command is required (use --help)");
  let sum = 0, invalid = 0;
  for (const index of cases) {
    const s = generate(options["--seed"] ?? "energy", index);
    const baselineCost = simulate(s, idle(s)).totalCost!;
    const benchmarkCost = benchmark(s);
    let result;
    try { result = simulate(s, await runParticipant(options["--command"], s, timeout)); }
    catch (error) { result = { valid: false, totalCost: null, violations: [(error as Error).message], rows: [] }; }
    const points = result.totalCost === null ? 0 : score(result.totalCost, baselineCost, benchmarkCost, result.valid);
    sum += points;
    if (!result.valid) invalid++;
    console.log(JSON.stringify({
      requestId: s.requestId, valid: result.valid, totalCost: result.totalCost,
      baselineCost, benchmarkCost, improvementEUR: result.totalCost === null ? null : baselineCost - result.totalCost,
      score: points, violations: result.violations,
      hourlySoC: result.rows.map(r => ({hour: r.hour, socKWh: r.socKWh})),
      ...(verbose ? { scenario: s, hourlySimulation: result.rows } : {})
    }));
  }
  console.log(JSON.stringify({ cases: cases.length, invalid, meanScore: sum / cases.length }));
  if (invalid) process.exitCode = 1;
}
main().catch(error => { console.error((error as Error).message); process.exitCode = 2; });


