import { parseArgs } from 'node:util';
import { fixedCases, generateCases } from './generators.js';
import { run } from './runner.js';

try {
  const { values } = parseArgs({ options: {
    command: { type: 'string' }, seed: { type: 'string', default: '12345' },
    cases: { type: 'string', default: '20' }, timeout: { type: 'string', default: '5000' },
    verbose: { type: 'boolean', default: false }, help: { type: 'boolean', default: false }
  } });
  if (values.help) {
    console.log('npm test -- --command "node participant/main.js" [--seed 12345] [--cases 20] [--timeout 5000] [--verbose]');
  } else if (values.command === undefined) {
    // A fresh checkout is runnable without pretending that a participant exists.
    console.log('No participant command supplied. Running harness self-tests.\nUse npm test -- --command "node participant/main.js" to test your program.');
    const { spawnSync } = await import('node:child_process');
    const result = spawnSync(process.execPath, ['--import', 'tsx', '--test', 'harness/tests/harness.test.ts'], { stdio: 'inherit' });
    process.exitCode = result.status ?? 1;
  } else {
    if (!values.command.trim()) throw new Error('--command must not be empty');
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
