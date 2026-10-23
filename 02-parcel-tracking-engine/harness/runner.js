import { generate } from './generator.js';
import { reference } from './reference.js';
import { difference } from './validate.js';
import { startParticipant } from './process.js';
function options(args) {
  const o = { seed: '1', cases: 32, timeout: 5000, verbose: false };
  for (let i = 0; i < args.length; i++) {
    const key = args[i].replace(/^--/, '');
    if (args[i] === '--verbose') o.verbose = true;
    else if (['command', 'seed', 'cases', 'timeout'].includes(key) && args[i].startsWith('--')) {
      if (args[i + 1] === undefined) throw new Error(`Missing value for --${key}`);
      o[key] = args[++i];
    } else throw new Error(`Unknown argument ${args[i]}`);
  }
  for (const key of ['cases', 'timeout']) { o[key] = Number(o[key]); if (!Number.isSafeInteger(o[key]) || o[key] < 1) throw new Error(`--${key} must be a positive safe integer`); }
  if (o.timeout > 2147483647) throw new Error('--timeout must be at most 2147483647 ms');
  if (!o.command?.trim()) throw new Error('Usage: npm test -- --command "node participant/main.js" [--seed 1] [--cases 32] [--timeout 5000] [--verbose]');
  return o;
}
let participant;
try {
  const o = options(process.argv.slice(2));
  participant = startParticipant(o.command, o.timeout);
  let passed = 0;
  for (const { category, request } of generate(o.seed, o.cases)) {
    const label = `case-${String(passed).padStart(4, '0')}-${category}`;
    try {
      const actual = await participant.request(request), expected = reference(request);
      const diff = difference(expected, actual);
      if (diff) throw new Error(diff);
      passed++;
      if (o.verbose) console.log(`PASS ${label}`);
    } catch (error) {
      throw new Error(`FAIL seed=${JSON.stringify(o.seed)} case=${label} category=${category}\n${error.message}\nReproduce options (quote seed for your shell): --seed ${JSON.stringify(o.seed)} --cases ${passed + 1}\n${o.verbose ? `Input: ${JSON.stringify(request)}\n` : 'Use --verbose to print failing input.\n'}`);
    }
  }
  await participant.finish();
  console.log(`Passed ${passed}/${o.cases} cases (seed=${JSON.stringify(o.seed)}).`);
} catch (error) {
  console.error(error.message);
  if (participant?.stderr()) console.error(`Participant stderr (last 8192 characters):\n${participant.stderr()}`);
  process.exitCode = 1;
} finally { participant?.stop(); }
