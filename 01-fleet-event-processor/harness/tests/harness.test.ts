import test from 'node:test';
import assert from 'node:assert/strict';
import { expected } from '../reference.ts';
import { fixedCases, generateCases } from '../generators.ts';
import { differences } from '../validator.ts';
import { run } from '../runner.ts';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { edgeCases } from '../edge-cases.ts';
import { ResponseLines } from '../jsonl.ts';
import { parseResponse } from '../parse-response.ts';
const command = `"${process.execPath}" harness/tests/fixtures/mock.mjs`;

test('CLI defaults to participant/main.ts and allows custom commands', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'fleet participant '));
  const runner = fileURLToPath(new URL('../cli.ts', import.meta.url));
  const oracle = fileURLToPath(new URL('../reference.ts', import.meta.url));
  const runCli = (args: string[]) => spawnSync(process.execPath, [runner, '--cases', '2', ...args], {
    cwd, encoding: 'utf8', timeout: 30000, windowsHide: true,
  });
  try {
    let result = runCli([]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing participant\/main\.ts.*--command/);
    mkdirSync(join(cwd, 'participant'));
    // Match the existing participant package's CommonJS module setting.
    writeFileSync(join(cwd, 'participant', 'package.json'), '{"type":"commonjs"}');
    writeFileSync(join(cwd, 'participant', 'response.ts'), `
      const { expected } = require(${JSON.stringify(oracle)});
      module.exports.respond = (request: unknown): unknown => expected(request);
    `);
    const solution = `
      const { createInterface } = require('node:readline');
      const { respond } = require('./response.ts');
      createInterface({ input: process.stdin }).on('line', (line: string) => {
        const response: unknown = respond(JSON.parse(line));
        console.log(JSON.stringify(response));
      });
    `;
    writeFileSync(join(cwd, 'participant', 'main.ts'), solution);
    result = runCli([]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS: all \d+ cases/);
    writeFileSync(join(cwd, 'participant', 'custom.ts'), solution);
    writeFileSync(join(cwd, 'participant', 'main.ts'), 'throw new Error("default must not run");');
    result = runCli(['--command', `"${process.execPath}" participant/custom.ts`]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS: all \d+ cases/);
    result = runCli(['--command', '   ']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--command must not be empty/);
  } finally { rmSync(cwd, { recursive: true, force: true }); }
});
test('oracle matches independently authored smoke output', () => {
  const smoke = fixedCases()[1];
  assert.deepEqual(expected(smoke), JSON.parse(readFileSync(new URL('../../examples/smoke.output.jsonl', import.meta.url), 'utf8')));
});
test('ties, invalid-first ID consumption, global duplicates and invalid lastSeen', () => {
  assert.deepEqual(expected(fixedCases()[2]), { requestId: 'ties-and-invalids', vehicles: [{ vehicleId: 'v', battery: 80, location: null, status: 'reserved', lastSeen: 5 }] });
});
test('event value boundaries and ordinal sorting', () => {
  const result = expected(fixedCases()[3]);
  assert.deepEqual(result.vehicles.map(v => v.vehicleId), ['A', 'V0', 'V1', 'V2', 'a']);
  assert.equal(result.vehicles[0].battery, 0);
  assert.equal(result.vehicles.at(-1)!.lastSeen, 1720000000);
});
test('independent property clocks, fractional values, ASCII ties, extras and request reset', () => {
  assert.deepEqual(expected(fixedCases()[4]), { requestId: 'property-ordering', vehicles: [{
    vehicleId: 'v', location: { latitude: 1.25, longitude: -2.5 }, battery: 33.5, status: 'maintenance', lastSeen: 20
  }] });
  assert.deepEqual(expected(fixedCases()[5]).vehicles, [{ vehicleId: 'v', location: null, battery: 1, status: null, lastSeen: 0 }]);
  assert.deepEqual(expected(fixedCases()[6]).vehicles, []);
});
test('generation reproducible with thousands of events and hundreds of vehicles', () => {
  assert.deepEqual([...generateCases(42, 3)], [...generateCases(42, 3)]);
  assert.notDeepEqual([...generateCases(42, 1)], [...generateCases(43, 1)]);
  assert.ok(expected(generateCases(42, 1).next().value!).vehicles.length >= 390);
});
test('structural validation ignores object ordering but rejects extra keys and array reordering', () => {
  assert.deepEqual(differences({ a: 1, b: null }, { b: null, a: 1 }), []);
  assert.ok(differences({ a: null }, {}).length);
  assert.ok(differences({}, { extra: true }).length);
  assert.ok(differences([1, 2], [2, 1]).length);
});
test('subprocess handles multiple independent requests and stderr', async () => {
  await run(command + ' stderr', [{ requestId: 'one', events: [] }, { requestId: 'two', events: [] }], 2000);
});
for (const [mode, pattern] of [
  ['malformed', /invalid JSON/], ['duplicate', /duplicate/], ['silent', /timed out/],
  ['partial', /timed out/], ['exit', /exited/], ['hang-eof', /did not exit/],
  ['nonzero-eof', /exited/], ['extra-eof', /duplicate/], ['trailing-eof', /Trailing/],
  ['duplicate-key', /Duplicate JSON member/], ['extra-field', /unexpected/],
  ['wrong-id', /requestId/], ['blank', /invalid JSON/], ['oversized', /exceeds/]
] as const) {
  test(`rejects ${mode}`, async () => assert.rejects(run(command + ` ${mode}`, [{ requestId: 'one', events: [] }], 2000), pattern));
}
for (const mode of ['crlf', 'split']) {
  test(`accepts ${mode} transport`, async () => run(command + ` ${mode}`, [{ requestId: 'one', events: [] }, { requestId: 'two', events: [] }], 2000));
}
test('rejects zero exit before all requests are answered', async () => {
  await assert.rejects(run(command + ' early-exit', [{ requestId: 'one', events: [] }, { requestId: 'two', events: [] }], 2000), /exited|stdin/);
});
test('simple mock fails nonempty fleet case with useful diff', async () => {
  await assert.rejects(run(command, [fixedCases()[1]], 2000), /vehicles.length/);
});

test('edge scenarios have hand-checked expectations', () => {
  const scenarios = edgeCases();
  assert.deepEqual(expected(scenarios[0]).vehicles, []);
  const sortedIds = ['Vehicle-A', 'vehicle-10', 'vehicle-2', 'vehicle-a', 'vehicle-a0'];
  assert.deepEqual(expected(scenarios[1]).vehicles, sortedIds.map(vehicleId => ({ vehicleId, location: null, battery: 50, status: null, lastSeen: 1 })));
  assert.deepEqual(expected(scenarios[2]).vehicles, ['available', 'reserved', 'driving', 'charging', 'maintenance'].map((status, i) => ({ vehicleId: `v${i}`, location: null, battery: null, status, lastSeen: 0 })));
  for (const [index, battery, lastSeen] of [[3, 10, 1], [4, 50, 1], [5, 11, 1720000001]]) {
    assert.deepEqual(expected(scenarios[index]).vehicles, [{ vehicleId: 'v', location: null, battery, status: null, lastSeen }]);
  }
});

test('all participant fixtures honor the guaranteed input structure', () => {
  for (const request of [...fixedCases(), ...generateCases(0, 5), ...generateCases(4294967295, 5)]) {
    assert.ok(request.events.length <= 15000);
    assert.ok(new Set(request.events.flatMap(event => event && typeof event === 'object' && 'vehicleId' in event ? [event.vehicleId] : [])).size <= 1000);
    assert.deepEqual(JSON.parse(JSON.stringify(request)), request);
    assert.deepEqual(expected(JSON.parse(JSON.stringify(request))), expected(request));
    assert.equal(typeof request.requestId, 'string');
    for (const event of request.events) {
      assert.ok(event !== null && typeof event === 'object' && !Array.isArray(event));
      for (const id of [event.eventId, event.vehicleId]) {
        assert.equal(typeof id, 'string');
        assert.ok(id.length > 0 && !/[^A-Za-z0-9_-]/.test(id));
      }
      assert.ok(Number.isInteger(event.timestamp) && event.timestamp >= 0 && event.timestamp <= 2147483647);
      assert.ok(['location', 'battery', 'status'].includes(event.type));
      if (event.type === 'location') {
        assert.equal(typeof event.latitude, 'number'); assert.ok(Number.isFinite(event.latitude));
        assert.equal(typeof event.longitude, 'number'); assert.ok(Number.isFinite(event.longitude));
      } else if (event.type === 'battery') {
        assert.equal(typeof event.percentage, 'number'); assert.ok(Number.isFinite(event.percentage));
      } else assert.equal(typeof event.status, 'string');
    }
  }
});

test('unique valid events are order-independent; duplicate copies are idempotent', () => {
  const request = fixedCases()[4];
  assert.deepEqual(expected({ ...request, events: [...request.events].reverse() }), expected(request));
  assert.deepEqual(expected({ ...request, events: [...request.events, ...request.events] }), expected(request));
});

test('framing handles every byte split, CRLF, multiple lines and UTF-8', () => {
  const wire = Buffer.from('{"requestId":"🚚","vehicles":[]}\r\n{}\n');
  for (let split = 0; split <= wire.length; split++) {
    const result: string[] = [];
    const lines = new ResponseLines(line => result.push(line));
    lines.push(wire.subarray(0, split)); lines.push(wire.subarray(split)); lines.finish();
    assert.deepEqual(result, ['{"requestId":"🚚","vehicles":[]}', '{}']);
  }
});

test('framing byte limits are independent of chunk boundaries', () => {
  const lines = new ResponseLines(() => {}, 4);
  lines.push(Buffer.from('1234\n1234\n'));
  assert.throws(() => lines.push(Buffer.from('12345\n')), /exceeds/);
  const split = new ResponseLines(() => {}, 4);
  split.push(Buffer.from('1234'));
  assert.throws(() => split.push(Buffer.from('5')), /exceeds/);
  assert.throws(() => new ResponseLines(() => {}).push(Buffer.from([0xff, 10])), /UTF-8/);
  const partial = new ResponseLines(() => {});
  partial.push(Buffer.from(' ')); assert.throws(() => partial.finish(), /Trailing/);
});

test('response parsing rejects duplicate keys after unescaping, at any depth', () => {
  for (const line of ['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"a":[{"b":1,"b":2}]}']) {
    assert.throws(() => parseResponse(line), /Duplicate JSON member/);
  }
  assert.deepEqual(parseResponse('{"a":[{"b":1},{"b":2}],"b":"a,}\\\""}'), { a: [{ b: 1 }, { b: 2 }], b: 'a,}"' });
  assert.ok(differences({}, JSON.parse('{"__proto__":null}')).length);
  assert.ok(differences({}, JSON.parse('{"constructor":null}')).length);
  assert.deepEqual(differences({ n: 0 }, { n: -0 }), []);
  assert.ok(differences({ n: 1 }, { n: '1' }).length);
  assert.ok(differences({ n: 1 }, { n: Infinity }).length);
});
