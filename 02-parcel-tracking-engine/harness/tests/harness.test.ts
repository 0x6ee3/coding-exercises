import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Event, Status } from '../reference.ts';
import { reference, statuses } from '../reference.ts';
import { generate, categories } from '../generator.ts';
import { difference } from '../validate.ts';
const event = (eventId: string, type: Status, timestamp = 1, extra: Partial<Event> = {}): Event => ({ eventId, parcelId: 'P', type, timestamp, facilityId: eventId, ...extra });
const run = (events: Event[]) => reference({ requestId: 'r', events });
test('literal ordering, rejected events, facility and history expectations', () => {
  assert.deepEqual(run([event('b', 'PICKED_UP'), event('c', 'DELIVERED', 2), event('a', 'CREATED')]), {
    requestId: 'r', parcels: [{ parcelId: 'P', status: 'PICKED_UP', currentFacility: 'b', lastUpdated: 1, history: ['CREATED', 'PICKED_UP'], anomalies: [{ eventId: 'c', reason: 'INVALID_TRANSITION' }] }],
  });
});
test('all state pairs including terminal states and loops', () => {
  const routes: Record<string, Status[]> = { CREATED: ['CREATED'], PICKED_UP: ['CREATED', 'PICKED_UP'], IN_TRANSIT: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'], AT_SORTING_CENTER: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER'], OUT_FOR_DELIVERY: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY'] };
  routes.DELIVERED = [...routes.OUT_FOR_DELIVERY, 'DELIVERED']; routes.RETURNED = [...routes.OUT_FOR_DELIVERY, 'RETURNED'];
  const allowed = new Set(['CREATED:PICKED_UP', 'PICKED_UP:IN_TRANSIT', 'IN_TRANSIT:AT_SORTING_CENTER', 'AT_SORTING_CENTER:IN_TRANSIT', 'AT_SORTING_CENTER:OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY:DELIVERED', 'OUT_FOR_DELIVERY:RETURNED']);
  for (const from of statuses) for (const to of statuses) {
    const route = routes[from], accepted = allowed.has(`${from}:${to}`);
    const p = run([...route.map((s, i) => event(`e${i}`, s, i)), event('test', to, 100)]).parcels[0];
    assert.equal(p.status, accepted ? to : from, `${from}->${to}`);
    assert.equal(p.anomalies.length, accepted ? 0 : 1);
    assert.equal(p.history.length, route.length + Number(accepted));
    assert.equal(p.lastUpdated, accepted ? 100 : route.length - 1);
  }
});
test('missing and late creation preserve fixed initial fields', () => {
  assert.deepEqual(run([event('x', 'PICKED_UP')]), {
    requestId: 'r', parcels: [{ parcelId: 'P', status: 'NOT_CREATED', currentFacility: '', lastUpdated: 0, history: [], anomalies: [{ eventId: 'x', reason: 'MISSING_CREATED' }] }],
  });
  const p = run([event('early', 'IN_TRANSIT', 0), event('late', 'CREATED', 3)]).parcels[0];
  assert.equal(p.status, 'CREATED');
  assert.deepEqual(p.history, ['CREATED']);
  assert.equal(p.lastUpdated, 3);
  assert.deepEqual(p.anomalies, [{ eventId: 'early', reason: 'MISSING_CREATED' }]);
  assert.deepEqual(run([]), { requestId: 'r', parcels: [] });
  const zero = run([event('zero', 'CREATED', 0)]).parcels[0];
  assert.equal(zero.status, 'CREATED');
  assert.equal(zero.currentFacility, 'zero');
  assert.equal(zero.lastUpdated, 0);
  assert.deepEqual(zero.history, ['CREATED']);
});

test('deduplication is global, first-wins, and precedes sorting', () => {
  const p = run([event('same', 'CREATED', 10), event('same', 'DELIVERED', 0, { parcelId: 'OTHER' }), event('pickup', 'PICKED_UP', 11)]);
  assert.equal(p.parcels.length, 1);
  assert.deepEqual(p.parcels[0].history, ['CREATED', 'PICKED_UP']);
  assert.deepEqual(p.parcels[0].anomalies, []);
  const rejected = run([event('same', 'IN_TRANSIT', 1), event('same', 'CREATED', 0)]).parcels[0];
  assert.equal(rejected.status, 'NOT_CREATED');
  assert.deepEqual(rejected.anomalies, [{ eventId: 'same', reason: 'MISSING_CREATED' }]);
});

test('generator reproducibility, coverage, scale and sorting', () => {
  const a = [...generate('abc', 24)];
  assert.deepEqual(a, [...generate('abc', 24)]);
  assert.notDeepEqual(a, [...generate('def', 24)]);
  assert.deepEqual([...new Set(a.map(x => x.category))], categories);
  assert.equal(reference(a.find(x => x.category === 'scale')!.request).parcels.length, 2500);
  assert.deepEqual(run([event('a', 'CREATED', 0, { parcelId: 'z' }), event('b', 'CREATED', 0, { parcelId: 'A' })]).parcels.map(p => p.parcelId), ['A', 'z']);
});
test('generated assessment cases exercise their advertised adversarial behavior', () => {
  for (const seed of ['1', 'abc', 'hiring-2026']) {
    const cases = [...generate(seed, 96)];
    const output = (category: string) => reference(cases.find(c => c.category === category)!.request);
    const terminal = output('after-terminal').parcels;
    assert.ok(terminal.some(p => p.status === 'DELIVERED'));
    assert.ok(terminal.some(p => p.status === 'RETURNED'));
    for (const p of terminal) assert.deepEqual(p.anomalies.map(a => a.reason), Array(3).fill('INVALID_TRANSITION'));
    const tie = output('ties').parcels.find(p => p.parcelId === 'TIE');
    assert.ok(tie);
    assert.deepEqual(tie.history, ['CREATED']);
    assert.deepEqual(tie.anomalies, [{ eventId: 'tie-10', reason: 'MISSING_CREATED' }]);
    const boundaries = output('boundaries').parcels;
    assert.deepEqual(boundaries.map(p => p.parcelId), [' ', ' P ', '10', '2', 'A', 'P', '__proto__', 'a', 'constructor', 'p', 'z']);
    for (const p of boundaries) {
      assert.equal(p.lastUpdated, 9007199254740991);
      assert.equal(p.currentFacility, ' pickup ');
      assert.deepEqual(p.anomalies.map(a => a.reason), ['MISSING_CREATED']);
    }
    const matrix = output('transition-matrix').parcels;
    assert.equal(matrix.length, 49);
    assert.equal(matrix.filter(p => p.anomalies.length === 0).length, 7);
    assert.deepEqual(output('empty').parcels, []);
  }
});
test('generated wire requests are fully populated, typed, and non-null across seeds', () => {
  for (const seed of ['1', 'abc', 'hiring-2026']) for (const { request } of generate(seed, 96)) {
    const wire = JSON.parse(JSON.stringify(request));
    assert.equal(typeof wire.requestId, 'string');
    assert.ok(wire.requestId.length > 0);
    assert.ok(Array.isArray(wire.events));
    for (const e of wire.events) {
      for (const key of ['eventId', 'parcelId', 'facilityId']) {
        assert.equal(typeof e[key], 'string');
        assert.ok(e[key].length > 0);
      }
      assert.ok(statuses.includes(e.type));
      assert.ok(Number.isSafeInteger(e.timestamp) && e.timestamp >= 0);
    }
    const output = reference(wire);
    assert.deepEqual(Object.keys(output).sort(), ['parcels', 'requestId']);
    for (const parcel of output.parcels) {
      assert.deepEqual(Object.keys(parcel).sort(), ['anomalies', 'currentFacility', 'history', 'lastUpdated', 'parcelId', 'status']);
      assert.equal(typeof parcel.currentFacility, 'string');
      assert.ok(Number.isSafeInteger(parcel.lastUpdated));
      assert.ok(parcel.status === 'NOT_CREATED' || statuses.includes(parcel.status));
      assert.ok(!JSON.stringify(parcel).includes(':null'));
    }
  }
});

test('validator pinpoints nested mismatches and rejects extra keys', () => {
  assert.equal(difference({ timestamp: 0 }, { timestamp: -0 }), null);
  assert.match(difference({ parcels: [{ status: 'CREATED' }] }, { parcels: [{ status: null }] })!, /status/);
  assert.match(difference({}, { extra: 1 })!, /keys/);
  assert.equal(difference({ a: 1, b: 2 }, { b: 2, a: 1 }), null);
});
test('documented JSONL examples match literal expected responses', () => {
  const lines = (name: string) => readFileSync(new URL(`../../examples/${name}.jsonl`, import.meta.url), 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
  assert.deepEqual(lines('input').map(reference), lines('output'));
});
test('SPEC examples match the reference responses', () => {
  const spec = readFileSync(new URL('../../SPEC.md', import.meta.url), 'utf8');
  const examples = [...spec.matchAll(/```json\r?\n([^`]+)```/g)].map(m => JSON.parse(m[1]));
  assert.equal(examples.length, 6);
  for (let i = 0; i < examples.length; i += 2) assert.deepEqual(reference(examples[i]), examples[i + 1]);
});

test('identifiers preserve spaces and case across all identifier fields', () => {
  const response = reference({ requestId: ' case ', events: [
    event('e', 'PICKED_UP', 0, { parcelId: ' P ', facilityId: ' f ' }),
    event('E', 'CREATED', 0, { parcelId: ' P ', facilityId: 'F' }),
    event(' e ', 'CREATED', 0, { parcelId: 'P', facilityId: ' ' }),
    event('other', 'CREATED', 0, { parcelId: 'p', facilityId: 'f' }),
  ] });
  assert.equal(response.requestId, ' case ');
  assert.deepEqual(response.parcels.map(p => p.parcelId), [' P ', 'P', 'p']);
  assert.deepEqual(response.parcels.map(p => p.history), [['CREATED', 'PICKED_UP'], ['CREATED'], ['CREATED']]);
  assert.deepEqual(response.parcels.map(p => p.currentFacility), [' f ', ' ', 'f']);
  assert.ok(response.parcels.every(p => p.anomalies.length === 0));
});
test('repeated loops preserve all accepted scans and rejected terminal scan changes nothing', () => {
  const types: Status[] = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const p = run([...types.map((s, i) => event(`e${i}`, s, i)), event('after', 'RETURNED', 100)]).parcels[0];
  assert.deepEqual(p.history, types);
  assert.equal(p.currentFacility, 'e9');
  assert.equal(p.lastUpdated, 9);
  assert.deepEqual(p.anomalies, [{ eventId: 'after', reason: 'INVALID_TRANSITION' }]);
});
const root = fileURLToPath(new URL('../../', import.meta.url));
function cli(mode: string, cases = 1, timeout = 5000) {
  return spawnSync(process.execPath, ['harness/runner.ts', '--command', `"${process.execPath}" harness/tests/fixture.ts ${mode}`, '--cases', String(cases), '--timeout', String(timeout)], { cwd: root, encoding: 'utf8', timeout: 30000 });
}
test('CLI validates persistent multi-request process across every category', () => { const r = cli('correct', 96); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Passed 96\/96/); });
test('CLI streams participant stderr on successful requests', () => {
  const r = cli('stderr', 2);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stderr, 'fixture debug message\n'.repeat(2));
  assert.match(r.stdout, /Passed 2\/2/);
});

const failures = { wrong: /expected keys/, junk: /Invalid JSON/, extra: /stdout/, 'partial-extra': /stdout/, utf8: /UTF-8/, unterminated: /Response timeout/, exit: /Participant exited/, hang: /Response timeout/, 'nonzero-eof': /code 9/, 'hang-eof': /after EOF/ };
for (const [mode, expected] of Object.entries(failures)) test(`CLI rejects ${mode}`, () => { const r = cli(mode, 1, ['hang', 'hang-eof', 'unterminated'].includes(mode) ? 2000 : 5000); assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, expected); });
test('CLI rejects a timer value that would overflow instead of timing out immediately', () => {
  const r = spawnSync(process.execPath, ['harness/runner.ts', '--command', 'unused', '--timeout', '2147483648'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /at most 2147483647/);
});

test('CLI defaults to a TypeScript entry point and respects custom commands', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'parcel participant '));
  const runner = fileURLToPath(new URL('../runner.ts', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixture.ts', import.meta.url));
  const runCli = (args: string[]) => spawnSync(process.execPath, [runner, '--cases', '16', ...args], {
    cwd, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  try {
    let result = runCli([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing participant\/main\.ts.*--command/);
    mkdirSync(join(cwd, 'participant'));
    writeFileSync(join(cwd, 'package.json'), '{"type":"module"}');
    writeFileSync(join(cwd, 'participant', 'response.ts'), `
      import { reference } from ${JSON.stringify(new URL('../reference.ts', import.meta.url).href)};
      export function respond(request: Parameters<typeof reference>[0]): unknown { return reference(request); }
    `);
    writeFileSync(join(cwd, 'participant', 'main.ts'), `
      import { createInterface } from 'node:readline';
      import { respond } from './response.ts';
      for await (const line of createInterface({ input: process.stdin })) {
        const response: unknown = respond(JSON.parse(line));
        console.log(JSON.stringify(response));
      }
    `);
    result = runCli([]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Passed 16\/16/);
    writeFileSync(join(cwd, 'participant', 'main.ts'), 'throw new Error("default must not run");');
    result = runCli(['--command', `"${process.execPath}" "${fixture}" correct`]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Passed 16\/16/);
    result = runCli(['--command', '   ']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--command must not be empty/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});

test('CLI streams all participant stderr before a request fails without replaying it', async () => {
  const child = spawn(process.execPath, ['harness/runner.ts', '--command', `"${process.execPath}" harness/tests/fixture.ts stderr-fail`, '--cases', '1', '--timeout', '5000'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
  });
  const debug = 'debug start\n' + 'x'.repeat(9000) + '\ndebug end\n';
  let stderr = '', streamedBeforeFailure = false;
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => {
    stderr += data;
    if (stderr.includes(debug) && !stderr.includes('FAIL')) streamedBeforeFailure = true;
  });
  const code = await new Promise<number | null>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  assert.equal(code, 1, stderr);
  assert.ok(streamedBeforeFailure, 'full debug output must arrive while the request is still pending');
  assert.equal(stderr.split(debug).length - 1, 1, 'debug output must appear exactly once');
  assert.match(stderr, /expected keys/);
});
