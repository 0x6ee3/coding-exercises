import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { once } from 'node:events';
import { parseArgs } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';
import { Model, compareEvents, error, sameJson } from './model.ts';
import type { Message } from './model.ts';
import { generate } from './generator.ts';
import { Source, connect, deadline } from './transport.ts';
import type { Peer } from './transport.ts';
import { existsSync } from 'node:fs';

const options = { command: { type: 'string' }, seed: { type: 'string', default: '42' },
  devices: { type: 'string', default: '500' }, subscribers: { type: 'string', default: '8' },
  events: { type: 'string', default: '10000' }, rate: { type: 'string', default: '0' },
  timeout: { type: 'string', default: '10000' }, 'source-port': { type: 'string', default: '9090' },
  'subscriber-port': { type: 'string', default: '9091' }, verbose: { type: 'boolean' },
  stress: { type: 'boolean' }, help: { type: 'boolean' } } as const;

async function main() {
  const { values: v } = parseArgs({ options });
  if (v.help) { console.log('npm test -- [--command "..."] [--seed N --devices N --subscribers N --events N --rate N --timeout MS --source-port N --subscriber-port N --verbose --stress]\nDefaults to node participant/main.ts when --command is omitted.'); return; }
  if (v.command !== undefined && !v.command.trim()) throw new Error('--command must not be empty');
  if (v.command === undefined && !existsSync('participant/main.ts')) throw new Error('Missing participant/main.ts. Create it or provide --command "..." to run your solution.');
  function number(name: keyof typeof options, min: number, max = 1000000) {
    const n = Number(v[name]); if (!Number.isSafeInteger(n) || n < min || n > max) throw new Error(`Invalid --${name}: expected integer ${min}..${max}`); return n;
  }
  const seed = number('seed', 0, 4294967295), devices = number('devices', 1), subscribers = number('subscribers', 1, 1000),
    count = number('events', 1), rate = number('rate', 0), timeout = number('timeout', 100, 3600000),
    sourcePort = number('source-port', 0, 65535), port = number('subscriber-port', 1, 65535);
  if (sourcePort === port) throw new Error('Source and subscriber ports must differ');
  const source = new Source(), clients: { peer: Peer; subscriptions: Set<string>; expected: Message[] }[] = [];
  const model = new Model(), sentAt = new Map<string, number>(), latencies: number[] = [];
  let generated = 0, delivered = 0, missing = 0, unexpected = 0, invalidStates = 0, orderErrors = 0, failures = 0;
  let child: ReturnType<typeof spawn> | undefined, output = '', exiting = false;
  let terminationReason: Error | undefined;
  let stressResult = v.stress ? 'NOT RUN' : 'NOT REQUESTED';
  const cancellation = new AbortController();
  let sourcePeer: Peer;
  let batchId = 0;
  const started = performance.now();
  const assert = (condition: boolean, detail: string) => { if (!condition) { failures++; console.error(`FAIL ${detail}`); } };
  async function command(index: number, request: Message | string, expected: Message) {
    const c = clients[index];
    if (typeof request === 'string') await c.peer.fragmented(request + '\n', timeout);
    else await c.peer.send(request, timeout);
    const response = await c.peer.next(timeout);
    if (!sameJson(response, expected)) {
      if (expected.type === 'STATE') invalidStates++;
      else failures++;
      console.error(`FAIL client ${index}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(response)}`);
    }
  }
  async function subscription(index: number, deviceId: string, subscribe = true) {
    const type = subscribe ? 'SUBSCRIBE' : 'UNSUBSCRIBE';
    await command(index, { type, deviceId }, { type: 'ACK', command: type, deviceId });
    if (subscribe) clients[index].subscriptions.add(deviceId); else clients[index].subscriptions.delete(deviceId);
  }
  async function fence() {
    await source.barrier(sourcePeer, `batch-${++batchId}`, timeout);
    for (let i = 0; i < clients.length; i++) {
      const c = clients[i]; if (c.peer.closed) throw new Error(`Subscriber ${i} disconnected unexpectedly`);
      // A command response fences all earlier EVENTs queued for this same connection.
      await command(i, { type: 'GET_STATE', deviceId: 'tracker-0' }, model.state('tracker-0'));
      const result = compareEvents(c.expected, c.peer.events);
      missing += result.missing; unexpected += result.unexpected; orderErrors += result.orderErrors;
      delivered += c.peer.events.length;
      for (let j = 0; j < c.peer.events.length; j++) {
        const sent = sentAt.get(c.peer.events[j].eventId);
        if (sent !== undefined) latencies.push(c.peer.arrivals[j] - sent);
      }
      if (result.missing || result.unexpected || result.orderErrors) console.error(`FAIL batch ${batchId}, client ${i}: ${JSON.stringify(result)}`);
      c.expected = []; c.peer.events = []; c.peer.arrivals = [];
      assert(c.peer.queue.length === 0, `client ${i}: extra command responses`);
    }
    if (v.verbose) console.log(`Verified batch ${batchId}: ${model.accepted} accepted so far`);
  }
  async function checkState(index: number, deviceId: string) {
    const peer = clients[index].peer;
    await peer.send({ type: 'GET_STATE', deviceId }, timeout);
    const actual = await peer.next(timeout);
    if (!sameJson(actual, model.state(deviceId))) {
      invalidStates++; console.error(`FAIL state ${deviceId}: ${JSON.stringify(actual)}`);
    }
  }
  async function batch(events: Message[], fragment = false) {
    for (const e of events) {
      generated++;
      const accepted = model.apply(e);
      if (accepted) {
        sentAt.set(e.eventId, performance.now());
        for (const c of clients) if (c.subscriptions.has(e.deviceId)) c.expected.push(accepted);
      }
    }
    const raw = events.map(e => JSON.stringify(e) + '\n').join('');
    if (fragment) await sourcePeer.fragmented(raw, timeout); else await sourcePeer.writeRaw(raw, timeout);
    await fence();
  }
  const terminate = () => { exiting = true; for (const c of clients) c.peer.socket.destroy(); for (const p of source.peers) p.socket.destroy(); };
  const interrupt = (reason: Error) => { terminationReason = reason; source.cancel(reason); cancellation.abort(); terminate(); };
  const onSignal = () => { interrupt(new Error('Run interrupted by signal')); };
  process.on('SIGINT', onSignal); process.on('SIGTERM', onSignal);
  try {
    const actualPort = await source.listen(sourcePort);
    console.log(`Seed ${seed}; source 127.0.0.1:${actualPort}; subscriber 127.0.0.1:${port}`);
    child = spawn(v.command ?? process.execPath, v.command === undefined ? ['participant/main.ts'] : [], {
      shell: v.command !== undefined, detached: process.platform !== 'win32', windowsHide: true,
      env: { ...process.env, TRACKER_SOURCE_HOST: '127.0.0.1', TRACKER_SOURCE_PORT: String(actualPort),
        SUBSCRIBER_HOST: '127.0.0.1', SUBSCRIBER_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.on('error', e => { output += String(e); interrupt(e); });
    child.on('exit', (code, signal) => { if (!exiting) { output += `\nParticipant exited: ${code ?? signal}`; interrupt(new Error(`Participant exited: ${code ?? signal}`)); } });
    for (const stream of [child.stdout, child.stderr]) stream?.on('data', b => { output = (output + b.toString()).slice(-16000); if (v.verbose) process.stderr.write(b); });
    sourcePeer = await source.accept(timeout);
    for (let i = 0; i < subscribers; i++) clients.push({ peer: await connect(port, timeout), subscriptions: new Set(), expected: [] });
    await command(0, '{', error(null, null, 'INVALID_JSON'));
    await command(0, { type: 'WAT', deviceId: 'tracker-0' }, error('WAT', 'tracker-0', 'UNKNOWN_COMMAND'));
    await command(0, { type: 'SUBSCRIBE' }, error('SUBSCRIBE', null, 'INVALID_COMMAND'));
    await command(0, { type: 'GET_STATE', deviceId: 'unknown' }, error('GET_STATE', 'unknown', 'UNKNOWN_DEVICE'));
    // Pipeline malformed and valid commands in one write; verify reply count and wire order.
    const commands: [string, Message][] = [
      ['null', error(null, null, 'INVALID_COMMAND')], ['[]', error(null, null, 'INVALID_COMMAND')],
      ['{}', error(null, null, 'INVALID_COMMAND')], ['{"type":42,"deviceId":"tracker-0"}', error(null, 'tracker-0', 'INVALID_COMMAND')],
      ['{"type":"","deviceId":"tracker-0"}', error(null, 'tracker-0', 'INVALID_COMMAND')],
      ['{"type":"WAT"}', error('WAT', null, 'UNKNOWN_COMMAND')],
      ['{"type":"GET_STATE","deviceId":42}', error('GET_STATE', null, 'INVALID_COMMAND')],
      ['{"type":"UNSUBSCRIBE","deviceId":""}', error('UNSUBSCRIBE', null, 'INVALID_COMMAND')],
      ['', error(null, null, 'INVALID_JSON')],
      ['{"type":"GET_STATE","deviceId":"unknown","ignored":true}', error('GET_STATE', 'unknown', 'UNKNOWN_DEVICE')]
    ];
    await clients[0].peer.writeRaw(commands.map(([raw]) => raw + '\r\n').join(''), timeout);
    for (const [, expected] of commands) assert(sameJson(await clients[0].peer.next(timeout), expected), 'pipelined command response');
    for (let i = 0; i < subscribers; i++) {
      for (let d = 0; d < devices; d++) if (d === 0 || d % subscribers === i) await subscription(i, `tracker-${d}`);
    }
    await subscription(0, 'tracker-0'); // Idempotence; subscribing before first event is legal.
    const e = (sequence: number, fields: Message = {}) => ({ type: 'LOCATION', eventId: `probe-${sequence}`, deviceId: 'tracker-0', sequence, timestamp: 1720000000 + sequence, latitude: 52.52, longitude: 13.405, ...fields });
    await sourcePeer.fragmented('{bad json}\n{"type":"UNKNOWN"}\nnull\n[]\n{"type":"BARRIER"}\n', timeout);
    await batch([e(1), e(3, { type: 'BATTERY', percentage: 80 }), e(2, { type: 'STATUS', state: 'OFFLINE' }), e(3, { type: 'BATTERY', percentage: 80 }), e(3, { eventId: 'equal-sequence' }), e(4, { latitude: 999 }), e(4, { type: 'STATUS', state: 'OFFLINE' })], true);
    await checkState(0, 'tracker-0'); // Check retention before a later update can mask a defect.
    const edge = 'edge-é-🛰';
    await subscription(0, edge);
    await batch([e(1, { deviceId: edge, eventId: 'edge-1', type: 'BATTERY', percentage: 0, timestamp: 0 })], true);
    await checkState(0, edge); // Never-observed location/status fields must be absent.
    await batch([
      e(2, { deviceId: edge, eventId: 'edge-2', latitude: -90, longitude: 180, timestamp: 0 }),
      e(3, { deviceId: edge, eventId: 'edge-3', type: 'BATTERY', percentage: 100, timestamp: 1 }),
      e(4, { deviceId: edge, eventId: 'edge-4', latitude: 90, longitude: -180, timestamp: 0 }),
      e(5, { deviceId: edge, eventId: 'edge-5', type: 'STATUS', state: 'IDLE' }),
      e(6, { deviceId: edge, eventId: 'probe-2' }), // Globally duplicate ID from a stale event.
      e(7, { deviceId: edge, eventId: 'probe-1' }), // Globally duplicate accepted ID.
      e(8, { deviceId: edge, eventId: 'invalid-retry', type: 'BATTERY', percentage: -1 }),
      e(8, { deviceId: edge, eventId: 'invalid-retry', type: 'BATTERY', percentage: 0.125 }),
      e(9007199254740991, { deviceId: edge, eventId: 'max-safe', timestamp: 9007199254740991, ignored: 'extra' })
    ], true);
    await checkState(0, edge);
    await subscription(0, 'invalid-only');
    const invalidFields: Message[] = [
      { sequence: 0 }, { sequence: 1.5 }, { timestamp: -1 }, { timestamp: '100' },
      { type: 'STATUS', state: 'UNKNOWN' }, { type: 'BATTERY', percentage: '20' },
      { type: 'BATTERY', percentage: 101 }, { latitude: '52' }, { longitude: 181 },
      { eventId: '' }, { deviceId: '' }, { type: 'NOT_AN_EVENT' }
    ];
    await batch(invalidFields.map((fields, i) => e(1, { deviceId: 'invalid-only', eventId: `invalid-${i}`, ...fields })));
    await checkState(0, 'invalid-only'); // Invalid first events must not create a device.
    await subscription(0, 'tracker-0', false);
    await subscription(0, 'tracker-0', false);
    await batch([e(5)]);
    await subscription(0, 'tracker-0'); await fence(); // No replay.
    clients[0].peer.socket.destroy();
    clients[0] = { peer: await connect(port, timeout), subscriptions: new Set(), expected: [] };
    await batch([e(6)]); // Reconnection has no inherited subscriptions.
    await subscription(0, 'tracker-0');
    sourcePeer.socket.destroy(); sourcePeer = await source.accept(timeout);
    await checkState(0, 'tracker-0'); // Detect reset state before a new event restores metadata.
    await checkState(0, edge);
    await batch([e(7, { type: 'STATUS', state: 'ACTIVE' }), e(1), e(8, { eventId: 'probe-1' })]); // State and dedup persist.
    const events = generate(seed, devices, count), pacingStart = performance.now();
    for (let offset = 0; offset < events.length; offset += 250) {
      if (rate) await delay(Math.max(0, pacingStart + offset / rate * 1000 - performance.now()), undefined, { signal: cancellation.signal });
      await batch(events.slice(offset, offset + 250), offset % 500 === 0);
      if ((offset / 250) % 4 === 0) await subscription(0, `tracker-${Math.floor(offset / 250) % devices}`, (offset / 250) % 8 === 0);
    }
    for (const deviceId of model.states.keys()) {
      await checkState(0, deviceId);
    }
    await fence();
    if (v.stress) {
      console.log('Stress: paused subscriber, 200,000 events; healthy fanout must remain responsive.');
      const slow = await connect(port, timeout);
      try {
        await slow.send({ type: 'SUBSCRIBE', deviceId: 'stress-device' }, timeout);
        assert(sameJson(await slow.next(timeout), { type: 'ACK', command: 'SUBSCRIBE', deviceId: 'stress-device' }), 'stress subscription ACK');
        // A healthy subscription must survive low-volume traffic before overload begins.
        await subscription(0, 'stress-device');
        const warmup = { type: 'STATUS', eventId: 'stress-warmup', deviceId: 'stress-device', sequence: 1, timestamp: 0, state: 'ACTIVE' };
        await batch([warmup]);
        await slow.send({ type: 'GET_STATE', deviceId: 'stress-device' }, timeout);
        assert(sameJson(await slow.next(timeout), model.state('stress-device')), 'stress warmup state');
        assert(compareEvents([{ type: 'EVENT', eventId: 'stress-warmup', deviceId: 'stress-device', sequence: 1, eventType: 'STATUS', timestamp: 0, data: { state: 'ACTIVE' } }], slow.events).missing === 0
          && slow.events.length === 1, 'stress warmup delivery');
        slow.events = []; slow.arrivals = []; slow.allowTruncatedClose = true;
        slow.socket.pause();
        for (let start = 1; start <= 200000; start += 250) {
          const events = Array.from({ length: 250 }, (_, i) => ({ type: 'LOCATION', eventId: `stress-${start + i}`,
            deviceId: 'stress-device', sequence: start + i + 1, timestamp: 1720000000, latitude: 52.123456789, longitude: 13.123456789 }));
          // Also validates every notification on the healthy subscriber for this device.
          await batch(events);
        }
        slow.socket.resume();
        if (!slow.closed) {
          try { await deadline(once(slow.socket, 'close'), timeout, 'slow subscriber disconnect after overload'); }
          catch (e) { if (!(e as Error).message.startsWith('Timeout:')) throw e; }
        }
        if (slow.failure) throw slow.failure;
        stressResult = slow.closed ? 'DISCONNECT OBSERVED (queue bound requires code review)' : 'INCONCLUSIVE (transport saturation not established)';
        await checkState(0, 'stress-device');
        await fence();
      } finally { slow.socket.destroy(); }
    }
  } catch (e) {
    failures++; console.error(`FAIL ${e instanceof Error ? e.message : e}`);
    if (output) console.error(`Participant output (tail):\n${output}`);
  } finally {
    if (terminationReason) { failures++; console.error(`FAIL ${terminationReason.message}`); }
    terminate();
    if (child?.pid) {
      if (process.platform === 'win32') {
        await promisify(execFile)('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }).catch(() => {});
      } else { try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
      if (child.exitCode === null && child.signalCode === null) {
        try { await deadline(once(child, 'exit'), 1500, 'participant exit'); }
        catch { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
      }
    }
    await source.close(); process.off('SIGINT', onSignal); process.off('SIGTERM', onSignal);
    const seconds = (performance.now() - started) / 1000;
    latencies.sort((a, b) => a - b);
    const percentile = (q: number) => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * q))].toFixed(2) : 'n/a';
    const pass = failures + missing + unexpected + invalidStates + orderErrors === 0;
    const verdict = !pass ? 'FAIL' : v.stress && stressResult.startsWith('INCONCLUSIVE') ? 'INCONCLUSIVE' : 'PASS';
    console.log(`\nEvents generated: ${generated}\nEvents accepted: ${model.accepted}\nDuplicates ignored: ${model.duplicates}\nStale events ignored: ${model.stale}\nInvalid source events ignored: ${model.invalid}\nEvents delivered: ${delivered}\nMissing notifications: ${missing}\nUnexpected notifications: ${unexpected}\nInvalid states: ${invalidStates}\nOrder violations: ${orderErrors}\nOther failures: ${failures}\nThroughput: ${(generated / seconds).toFixed(1)} events/s (whole run)\nLatency ms: p50=${percentile(0.5)}, p95=${percentile(0.95)}, p99=${percentile(0.99)}\nFunctional correctness: ${pass ? 'PASS' : 'FAIL'}\nTest verdict: ${verdict}`);
    console.log(`Stress result: ${stressResult}`);
    if (pass && v.stress && stressResult.startsWith('INCONCLUSIVE')) {
      console.log('Overall assessment: INCONCLUSIVE'); process.exitCode = 2;
    } else process.exitCode = pass ? 0 : 1;
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
