import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Model, compareEvents, validEvent, sameJson } from '../model.ts';
import { generate } from '../generator.ts';
import { Source, Peer, JsonLines, connect, deadline } from '../transport.ts';

const event = (sequence: number, extra = {}) => ({ type: 'LOCATION', eventId: `e-${sequence}`, deviceId: 'a',
  sequence, timestamp: 100, latitude: 52, longitude: 13, ...extra });
test('oracle merges properties, deduplicates globally and rejects equal/stale sequences across types', () => {
  const m = new Model(); m.apply(event(1)); m.apply(event(3, { type: 'BATTERY', percentage: 20 }));
  assert.equal(m.apply(event(2, { type: 'STATUS', state: 'OFFLINE' })), undefined);
  assert.equal(m.apply(event(3)), undefined);
  assert.equal(m.apply(event(3, { eventId: 'equal' })), undefined);
  assert.equal(m.apply(event(9, { eventId: 'e-2', deviceId: 'b' })), undefined); // stale IDs are remembered
  assert.deepEqual(m.state('a'), { type: 'STATE', deviceId: 'a', sequence: 3, timestamp: 100,
    data: { latitude: 52, longitude: 13, percentage: 20 } });
  assert.equal(m.accepted, 2); assert.equal(m.stale, 2); assert.equal(m.duplicates, 2);
  assert.equal(m.state('absent').code, 'UNKNOWN_DEVICE');
});
test('invalid events do not reserve IDs or advance sequences', () => {
  const m = new Model(); assert.equal(validEvent(event(1, { latitude: 91 })), false);
  m.apply(event(1, { latitude: 91 })); assert.ok(m.apply(event(1)));
  for (const e of [event(2, { percentage: 101, type: 'BATTERY' }), event(2, { type: 'STATUS', state: 'BAD' }), event(0), event(2, { timestamp: -1 })]) assert.equal(validEvent(e), false);
});
test('generator is reproducible, seed-sensitive and includes multiple kinds and duplicates', () => {
  const a = generate(42, 500, 5000);
  assert.deepEqual(a, generate(42, 500, 5000)); assert.notDeepEqual(a, generate(43, 500, 5000));
  const m = new Model(); a.forEach(e => m.apply(e));
  assert.ok(a.every(validEvent));
  for (const seed of [0, 1, 4294967295]) assert.ok(generate(seed, 1, 100).every(validEvent));
  assert.ok(m.duplicates > 0); assert.ok(m.stale > 0);
  assert.deepEqual([...new Set(a.map(e => e.type))].sort(), ['BATTERY', 'LOCATION', 'STATUS']);
});
test('delivery validator detects missing, duplicate, corrupted and per-device reversed messages', () => {
  const a = event(1), b = event(2), c = event(3, { deviceId: 'b' });
  assert.deepEqual(compareEvents([a, b, c], [c, a, b]), { missing: 0, unexpected: 0, orderErrors: 0 });
  assert.deepEqual(compareEvents([a, b], [b, a, a]), { missing: 0, unexpected: 1, orderErrors: 1 });
  assert.deepEqual(compareEvents([a], [{ ...a, latitude: 0 }]), { missing: 1, unexpected: 1, orderErrors: 0 });
});
test('source TCP READY, barriers, fragmentation, coalescing and reconnect use controlled fixtures', async () => {
  const source = new Source(); const port = await source.listen(0);
  try {
    const remote = await connect(port, 500);
    assert.deepEqual(await remote.next(500), { type: 'READY', protocolVersion: 1 });
    const peer = await source.accept(500);
    const barrier = source.barrier(peer, 'b1', 500);
    assert.deepEqual(await remote.next(500), { type: 'BARRIER', barrierId: 'b1' });
    await remote.fragmented('{"type":"BARRIER_ACK","barrierId":"b1"}\n', 500); await barrier;
    await peer.fragmented('{"type":"fixture","value":"é🛰"}\n{"type":"fixture2"}\n', 500);
    assert.equal((await remote.next(500)).value, 'é🛰'); assert.equal((await remote.next(500)).type, 'fixture2');
    remote.socket.destroy(); peer.socket.destroy();
    const second = await connect(port, 500); await source.accept(500); assert.equal((await second.next(500)).type, 'READY');
    second.socket.destroy();
  } finally { await source.close(); }
});
test('subscriber fixture receives split commands and fences earlier events before state', async () => {
  const server = net.createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const accepted = once(server, 'connection');
  const client = await connect((server.address() as net.AddressInfo).port, 500);
  const fixture = new Peer((await accepted)[0]);
  try {
    await client.fragmented('{"type":"SUBSCRIBE","deviceId":"a"}\n', 500);
    assert.deepEqual(await fixture.next(500), { type: 'SUBSCRIBE', deviceId: 'a' });
    await fixture.writeRaw('{"type":"EVENT","deviceId":"a"}\n{"type":"STATE","deviceId":"a"}\n', 500);
    assert.equal((await client.next(500)).type, 'STATE'); assert.equal(client.events.length, 1);
  } finally { client.socket.destroy(); fixture.socket.destroy(); await new Promise<void>(r => server.close(() => r())); }
});
test('timeouts and malformed peer responses fail deterministically', async () => {
  await assert.rejects(deadline(new Promise(() => {}), 10, 'fixture'), /Timeout: fixture/);
  const source = new Source(); const port = await source.listen(0);
  const remote = await connect(port, 500); const peer = await source.accept(500);
  try { await remote.next(500); await remote.writeRaw('not-json\n', 500); await assert.rejects(peer.next(500), /Invalid response/); }
  finally { remote.socket.destroy(); await source.close(); }
});
test('wrong barrier IDs are rejected', async () => {
  const source = new Source(); const port = await source.listen(0);
  const remote = await connect(port, 500); const peer = await source.accept(500);
  try {
    await remote.next(500);
    const result = assert.rejects(source.barrier(peer, 'right', 500), /Invalid BARRIER_ACK/);
    await remote.next(500); await remote.send({ type: 'BARRIER_ACK', barrierId: 'wrong' }, 500); await result;
  } finally { remote.socket.destroy(); await source.close(); }
});
test('runner reports startup failure and timeout, cleans up, and exits nonzero', () => {
  const cwd = fileURLToPath(new URL('../../', import.meta.url));
  const fixture = fileURLToPath(new URL('./fixtures/lifecycle.ts', import.meta.url));
  for (const mode of ['exit', 'idle']) {
    const result = spawnSync(process.execPath, ['harness/cli.ts', '--command', `"${process.execPath}" "${fixture}" ${mode}`,
      '--source-port', '0', '--timeout', mode === 'exit' ? '3000' : '200', '--events', '1'], { cwd, encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 1);
    assert.match(result.stdout, /Test verdict: FAIL/);
    if (mode === 'exit') assert.match(result.stderr, /Participant exited: 7/);
    else assert.match(result.stderr, /Timeout: source connection/);
  }
});
test('JSON framing survives every byte boundary, rejects invalid UTF-8 and detects partial EOF', () => {
  const bytes = Buffer.from('{"type":"ACK","deviceId":"é🛰"}\r\n{"type":"STATE"}\n');
  const expected = [{ type: 'ACK', deviceId: 'é🛰' }, { type: 'STATE' }];
  for (let cut = 0; cut <= bytes.length; cut++) {
    const parser = new JsonLines();
    assert.deepEqual([...parser.push(bytes.subarray(0, cut)), ...parser.push(bytes.subarray(cut))], expected);
    parser.end();
  }
  const parser = new JsonLines();
  parser.push(Buffer.from('{"type":"ACK"}')); assert.throws(() => parser.end(), /unterminated/);
  assert.throws(() => new JsonLines().push(Buffer.from([0xff, 10])), /encoded data/);
  assert.throws(() => new JsonLines().push(Buffer.from('x'.repeat(65537))), /64 KiB/);
  assert.throws(() => new JsonLines().push(Buffer.from('[]\n')), /JSON object/);
});
test('JSON equality is language independent but still rejects extra/missing fields', () => {
  assert.ok(sameJson({ a: -0, b: 1.0 }, { b: 1, a: 0 }));
  assert.ok(!sameJson({ a: 1 }, { a: 1, b: null }));
  assert.ok(!sameJson({ a: 1 }, { a: '1' }));
  assert.deepEqual(compareEvents([{ value: -0 }], [{ value: 0 }]), { missing: 0, unexpected: 0, orderErrors: 0 });
});
test('boundary fixtures retain sparse state and ignore duplicate IDs across devices', () => {
  const m = new Model();
  assert.ok(m.apply(event(1, { type: 'BATTERY', percentage: 0, timestamp: 0 })));
  assert.deepEqual(m.state('a').data, { percentage: 0 });
  assert.ok(m.apply(event(2, { latitude: -90, longitude: 180 })));
  assert.ok(m.apply(event(3, { latitude: 90, longitude: -180 })));
  assert.ok(m.apply(event(Number.MAX_SAFE_INTEGER, { timestamp: Number.MAX_SAFE_INTEGER })));
  assert.equal(m.apply(event(4)), undefined);
  assert.equal(m.apply(event(1, { deviceId: 'é🛰' })), undefined);
  assert.equal(m.states.has('é🛰'), false);
  assert.equal(validEvent(event(Number.MAX_SAFE_INTEGER + 1)), false);
});
test('source cancellation promptly wakes pending startup/reconnect waits', async () => {
  const source = new Source();
  const pending = assert.rejects(source.accept(10000), /cancelled fixture/);
  source.cancel(new Error('cancelled fixture')); await pending;
  await assert.rejects(source.accept(10000), /cancelled fixture/);
});
