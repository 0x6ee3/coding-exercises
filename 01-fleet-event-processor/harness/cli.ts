import { parseArgs } from 'node:util';
import { existsSync } from 'node:fs';
import { fixedCases, generateCases } from './generators.ts';
import { run } from './runner.ts';

try {
  const { values } = parseArgs({ options: {
    command: { type: 'string' }, seed: { type: 'string', default: '12345' },
    cases: { type: 'string', default: '20' }, timeout: { type: 'string', default: '5000' },
    verbose: { type: 'boolean', default: false }, help: { type: 'boolean', default: false }
  } });
  if (values.help) {
    console.log('npm test -- [--command "..."] [--seed 12345] [--cases 20] [--timeout 5000] [--verbose]\nDefaults to node participant/main.ts when --command is omitted.');
  } else {
    if (values.command !== undefined && !values.command.trim()) throw new Error('--command must not be empty');
    if (values.command === undefined && !existsSync('participant/main.ts')) throw new Error('Missing participant/main.ts. Create it or provide --command "..." to run your solution.');
    const numeric = (name: 'seed' | 'cases' | 'timeout', min: number, max: number) => {
      const raw = values[name]!;
      const n = Number(raw);
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(n) || n < min || n > max) throw new Error(`--${name} must be an integer from ${min} to ${max}`);
      return n;
    };
    const seed = numeric('seed', 0, 4294967295), count = numeric('cases', 0, 10000), timeout = numeric('timeout', 1, 2147483647);
    const fixed = fixedCases();
    const cases = (function* () { yield* fixed; yield* generateCases(seed, count); })();
    const total = fixed.length + count;
    console.log(`Seed ${seed}; ${total} cases (${count} randomized); timeout ${timeout} ms per response`);
    await run(values.command, cases, timeout, values.verbose);
    console.log(`PASS: all ${total} cases`);
  }
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
