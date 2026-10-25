import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { reference, statuses } from '../reference.js';
import { generate, categories } from '../generator.js';
import { difference } from '../validate.js';
const event = (eventId, type, timestamp = 1, extra = {}) => ({ eventId, parcelId: 'P', type, timestamp, facilityId: eventId, ...extra });
const run = events => reference({ requestId: 'r', events });
test('literal ordering, rejected events, facility and history expectations', () => {
  assert.deepEqual(run([event('b', 'PICKED_UP'), event('c', 'DELIVERED', 2), event('a', 'CREATED')]), {
    requestId: 'r', errors: [], parcels: [{ parcelId: 'P', status: 'PICKED_UP', currentFacility: 'b', lastUpdated: 1, history: ['CREATED', 'PICKED_UP'], anomalies: [{ eventId: 'c', reason: 'INVALID_TRANSITION' }] }],
  });
});
test('all state pairs including terminal states and loops', () => {
  const routes = { CREATED: ['CREATED'], PICKED_UP: ['CREATED', 'PICKED_UP'], IN_TRANSIT: ['CREATED', 'PICKED_UP', 'IN_TRANSIT'], AT_SORTING_CENTER: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER'], OUT_FOR_DELIVERY: ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY'] };
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
test('missing creation, late creation, payload precedence and global first-wins deduplication', () => {
  const r = run([event('bad', 'CREATED', 'bad'), event('bad', 'CREATED', 0), event('early', 'IN_TRANSIT', 0), event('late', 'CREATED', 3), event('late', 'CREATED', 0, { parcelId: 'OTHER' })]);
  assert.equal(r.parcels.length, 1);
  assert.deepEqual(r.parcels[0].history, ['CREATED']);
  assert.equal(r.parcels[0].lastUpdated, 3);
  assert.deepEqual(r.parcels[0].anomalies, [{ eventId: 'bad', reason: 'INVALID_TIMESTAMP' }, { eventId: 'early', reason: 'MISSING_CREATED' }]);
  assert.equal(run([event('x', 'PICKED_UP')]).parcels[0].status, null);
});
test('malformed payloads and unusable identifiers are explicit', () => {
  assert.deepEqual(run([null, {}, { eventId: 'x' }, { eventId: 'x', parcelId: 'ignored' }]).errors, [{ index: 0, reason: 'INVALID_EVENT' }, { index: 1, reason: 'INVALID_EVENT_ID' }, { index: 2, eventId: 'x', reason: 'INVALID_PARCEL_ID' }]);
  for (const [patch, reason] of [[{ timestamp: undefined }, 'MISSING_FIELD'], [{ timestamp: null }, 'INVALID_TIMESTAMP'], [{ type: 'NO' }, 'INVALID_EVENT_TYPE'], [{ facilityId: '' }, 'INVALID_FACILITY_ID']]) {
    const e = event('x', 'CREATED', 0, patch); if (e.timestamp === undefined) delete e.timestamp;
    assert.deepEqual(run([e]).parcels[0].anomalies, [{ eventId: 'x', reason }]);
  }
  assert.deepEqual(reference(null), { requestId: null, parcels: [], errors: [{ reason: 'INVALID_REQUEST' }] });
  assert.deepEqual(run([]), { requestId: 'r', parcels: [], errors: [] });
});
test('generator reproducibility, coverage, scale and sorting', () => {
  const a = [...generate('abc', 24)];
  assert.deepEqual(a, [...generate('abc', 24)]);
  assert.notDeepEqual(a, [...generate('def', 24)]);
  assert.deepEqual([...new Set(a.map(x => x.category))], categories);
  assert.equal(reference(a.find(x => x.category === 'scale').request).parcels.length, 2500);
  assert.deepEqual(run([event('a', 'CREATED', 0, { parcelId: 'z' }), event('b', 'CREATED', 0, { parcelId: 'A' })]).parcels.map(p => p.parcelId), ['A', 'z']);
});
test('generated assessment cases exercise their advertised adversarial behavior', () => {
  for (const seed of ['1', 'abc', 'hiring-2026']) {
    const cases = [...generate(seed, 96)];
    const output = category => reference(cases.find(c => c.category === category).request);
    const terminal = output('after-terminal').parcels;
    assert.ok(terminal.some(p => p.status === 'DELIVERED'));
    assert.ok(terminal.some(p => p.status === 'RETURNED'));
    for (const p of terminal) assert.deepEqual(p.anomalies.map(a => a.reason), Array(3).fill('INVALID_TRANSITION'));
    const tie = output('ties').parcels.find(p => p.parcelId === 'TIE');
    assert.deepEqual(tie.history, ['CREATED']);
    assert.deepEqual(tie.anomalies, [{ eventId: 'tie-10', reason: 'MISSING_CREATED' }]);
    const boundaries = output('boundaries').parcels;
    assert.deepEqual(boundaries.map(p => p.parcelId), [' ', ' P ', '10', '2', 'A', 'P', '__proto__', 'a', 'constructor', 'p', 'z']);
    for (const p of boundaries) {
      assert.equal(p.lastUpdated, 9007199254740991);
      assert.equal(p.currentFacility, ' pickup ');
      assert.deepEqual(p.anomalies.map(a => a.reason), ['INVALID_TIMESTAMP', 'MISSING_CREATED']);
    }
    const matrix = output('transition-matrix').parcels;
    assert.equal(matrix.length, 49);
    assert.equal(matrix.filter(p => p.anomalies.length === 0).length, 7);
    assert.deepEqual(output('empty').parcels, []);
    for (const c of cases.filter(c => c.category === 'invalid-request')) assert.deepEqual(reference(c.request).errors, [{ reason: 'INVALID_REQUEST' }]);
  }
});
test('nonempty identifiers, validation precedence and integer boundaries follow protocol', () => {
  assert.deepEqual(run([event('', 'CREATED')]).errors, [{ index: 0, reason: 'INVALID_EVENT_ID' }]);
  assert.equal(run([event(' ', 'CREATED', -0)]).parcels[0].status, 'CREATED');
  const payloads = [
    [{ timestamp: false, type: 'bad', facilityId: null }, 'INVALID_TIMESTAMP'],
    [{ timestamp: 0, type: 'bad', facilityId: null }, 'INVALID_EVENT_TYPE'],
    [{ timestamp: 9007199254740991 }, null],
    [{ timestamp: 9007199254740992 }, 'INVALID_TIMESTAMP'],
  ];
  for (const [patch, reason] of payloads) {
    const p = run([event('x', 'CREATED', 0, patch)]).parcels[0];
    assert.deepEqual(p.anomalies, reason ? [{ eventId: 'x', reason }] : []);
  }
});
test('validator pinpoints nested mismatches and rejects extra keys', () => {
  assert.equal(difference({ timestamp: 0 }, { timestamp: -0 }), null);
  assert.match(difference({ parcels: [{ status: 'CREATED' }] }, { parcels: [{ status: null }] }), /status/);
  assert.match(difference({}, { extra: 1 }), /keys/);
  assert.equal(difference({ a: 1, b: 2 }, { b: 2, a: 1 }), null);
});
test('documented JSONL examples match literal expected responses', () => {
  const lines = name => readFileSync(new URL(`../../examples/${name}.jsonl`, import.meta.url), 'utf8').trim().split(/\r?\n/).map(JSON.parse);
  assert.deepEqual(lines('input').map(reference), lines('output'));
});
test('SPEC validation tables contain complete, correct expected responses', () => {
  const spec = readFileSync(new URL('../../SPEC.md', import.meta.url), 'utf8');
  const expected = [...spec.matchAll(/\| `({"requestId".*})` \|/g)].map(m => JSON.parse(m[1]));
  assert.equal(expected.length, 7);
  const payloads = [
    { eventId: 'e1', parcelId: 'P-1001', timestamp: 1000, type: 'CREATED' },
    { eventId: 'e1', parcelId: 'P-1001', timestamp: '1000', type: 'CREATED', facilityId: 'BER-01' },
    { eventId: 'e1', parcelId: 'P-1001', timestamp: 1000, type: 'UNKNOWN', facilityId: 'BER-01' },
    { eventId: 'e1', parcelId: 'P-1001', timestamp: 1000, type: 'CREATED', facilityId: '' },
  ];
  const requests = [...payloads.map(e => ({ requestId: 'case-validation', events: [e] })), ...[null, { parcelId: 'P-1001' }, { eventId: 'e1' }].map(e => ({ requestId: 'case-error', events: [e] }))];
  assert.deepEqual(requests.map(reference), expected);
});
test('identifiers preserve spaces and case across all identifier fields', () => {
  const response = reference({ requestId: ' case ', events: [
    event('e', 'PICKED_UP', 0, { parcelId: ' P ', facilityId: ' f ' }),
    event('E', 'CREATED', 0, { parcelId: ' P ', facilityId: 'F' }),
    event(' e ', 'CREATED', 0, { parcelId: 'P', facilityId: ' ' }),
    event('other', 'CREATED', 0, { parcelId: 'p', facilityId: 'f' }),
  ] });
  assert.equal(response.requestId, ' case ');
  assert.deepEqual(response.errors, []);
  assert.deepEqual(response.parcels.map(p => p.parcelId), [' P ', 'P', 'p']);
  assert.deepEqual(response.parcels.map(p => p.history), [['CREATED', 'PICKED_UP'], ['CREATED'], ['CREATED']]);
  assert.deepEqual(response.parcels.map(p => p.currentFacility), [' f ', ' ', 'f']);
  assert.ok(response.parcels.every(p => p.anomalies.length === 0));
});
test('repeated loops preserve all accepted scans and rejected terminal scan changes nothing', () => {
  const types = ['CREATED', 'PICKED_UP', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'IN_TRANSIT', 'AT_SORTING_CENTER', 'OUT_FOR_DELIVERY', 'DELIVERED'];
  const p = run([...types.map((s, i) => event(`e${i}`, s, i)), event('after', 'RETURNED', 100)]).parcels[0];
  assert.deepEqual(p.history, types);
  assert.equal(p.currentFacility, 'e9');
  assert.equal(p.lastUpdated, 9);
  assert.deepEqual(p.anomalies, [{ eventId: 'after', reason: 'INVALID_TRANSITION' }]);
});
const root = fileURLToPath(new URL('../../', import.meta.url));
function cli(mode, cases = 1, timeout = 5000) {
  return spawnSync(process.execPath, ['harness/runner.js', '--command', `"${process.execPath}" harness/tests/fixture.js ${mode}`, '--cases', String(cases), '--timeout', String(timeout)], { cwd: root, encoding: 'utf8', timeout: 30000 });
}
test('CLI validates persistent multi-request process across every category and envelope variant', () => { const r = cli('correct', 96); assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /Passed 96\/96/); });
const failures = { wrong: /expected keys/, junk: /Invalid JSON/, extra: /stdout/, 'partial-extra': /stdout/, utf8: /UTF-8/, unterminated: /Response timeout/, exit: /Participant exited/, hang: /Response timeout/, 'nonzero-eof': /code 9/, 'hang-eof': /after EOF/ };
for (const [mode, expected] of Object.entries(failures)) test(`CLI rejects ${mode}`, () => { const r = cli(mode, 1, ['hang', 'hang-eof', 'unterminated'].includes(mode) ? 2000 : 5000); assert.equal(r.status, 1, r.stderr); assert.match(r.stderr, expected); });
test('CLI rejects a timer value that would overflow instead of timing out immediately', () => {
  const r = spawnSync(process.execPath, ['harness/runner.js', '--command', 'unused', '--timeout', '2147483648'], { cwd: root, encoding: 'utf8', timeout: 10000 });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /at most 2147483647/);
});
