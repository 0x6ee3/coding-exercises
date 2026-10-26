import net from 'node:net';
import { once } from 'node:events';
import type { Message } from './model.ts';

export class JsonLines {
  private buffer = '';
  private decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  push(bytes: Buffer): Message[] {
    this.buffer += this.decoder.decode(bytes, { stream: true });
    const result: Message[] = [];
    let index: number;
    while ((index = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, index); this.buffer = this.buffer.slice(index + 1);
      if (Buffer.byteLength(line) > 65536) throw new Error('Response line exceeds 64 KiB');
      const value = JSON.parse(line);
      if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected JSON object');
      result.push(value);
    }
    if (Buffer.byteLength(this.buffer) > 65536) throw new Error('Unterminated response exceeds 64 KiB');
    return result;
  }
  end() {
    this.buffer += this.decoder.decode();
    if (this.buffer.length) throw new Error('Connection ended with an unterminated response');
  }
}

export function deadline<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([promise, new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timeout: ${label} (${ms}ms)`)), ms);
  })]).finally(() => clearTimeout(timer));
}
export class Peer {
  socket: net.Socket;
  queue: Message[] = [];
  events: Message[] = [];
  arrivals: number[] = [];
  failure?: Error;
  closed = false;
  private decoder = new JsonLines();
  allowTruncatedClose = false;
  private wake?: () => void;
  constructor(socket: net.Socket) {
    this.socket = socket;
    socket.setNoDelay(true);
    socket.on('data', data => {
      try {
        for (const m of this.decoder.push(data)) {
          if (m.type === 'EVENT') { this.events.push(m); this.arrivals.push(performance.now()); }
          else this.queue.push(m);
          if (this.events.length + this.queue.length > 1000000) throw new Error('Response budget exceeded');
        }
      } catch (e) { this.fail(new Error(`Invalid response: ${(e as Error).message}`, { cause: e })); return; }
      this.wake?.();
    });
    socket.on('end', () => { if (!this.allowTruncatedClose) {
      try { this.decoder.end(); } catch (e) { this.fail(e as Error); }
    } });
    socket.on('error', e => {
      if (this.allowTruncatedClose && (e as NodeJS.ErrnoException).code === 'ECONNRESET') return;
      this.fail(e);
    });
    socket.on('close', () => { this.closed = true; this.wake?.(); });
  }
  private fail(e: Error) { this.failure = e; this.socket.destroy(); this.wake?.(); }
  async next(timeout: number): Promise<Message> {
    if (this.failure) throw this.failure;
    const end = performance.now() + timeout;
    while (!this.queue.length) {
      if (this.failure) throw this.failure;
      if (this.closed) throw new Error('Connection closed before response');
      await deadline(new Promise<void>(resolve => { this.wake = resolve; }), Math.max(1, end - performance.now()), 'response');
    }
    return this.queue.shift()!;
  }
  async writeRaw(raw: string | Buffer, timeout: number) {
    if (this.failure) throw this.failure;
    if (this.closed) throw new Error('Write on closed connection');
    await deadline(new Promise<void>((resolve, reject) => this.socket.write(raw, e => e ? reject(e) : resolve())), timeout, 'TCP write');
  }
  async send(message: Message, timeout: number) { await this.writeRaw(JSON.stringify(message) + '\n', timeout); }
  async fragmented(raw: string, timeout: number) {
    const bytes = Buffer.from(raw);
    const unicode = bytes.findIndex(b => b >= 0x80);
    const cuts = [...new Set([0, Math.min(1, bytes.length), Math.min(7, bytes.length),
      ...(unicode >= 0 ? [unicode + 1] : []), bytes.length])].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) await this.writeRaw(bytes.subarray(cuts[i - 1], cuts[i]), timeout);
  }
}
export class Source {
  server = net.createServer();
  peers: Peer[] = [];
  private pending: Peer[] = [];
  private wake?: () => void;
  private stopped?: Error;
  cancel(reason: Error) { this.stopped = reason; this.wake?.(); }
  async listen(port: number) {
    this.server.on('connection', socket => {
      const peer = new Peer(socket); this.peers.push(peer); this.pending.push(peer);
      socket.write('{"type":"READY","protocolVersion":1}\n'); this.wake?.();
    });
    this.server.listen(port, '127.0.0.1'); await once(this.server, 'listening');
    return (this.server.address() as net.AddressInfo).port;
  }
  async accept(timeout: number) {
    if (this.stopped) throw this.stopped;
    if (!this.pending.length) await deadline(new Promise<void>(resolve => { this.wake = resolve; }), timeout, 'source connection');
    if (this.stopped) throw this.stopped;
    return this.pending.shift()!;
  }
  async barrier(peer: Peer, id: string, timeout: number) {
    await peer.send({ type: 'BARRIER', barrierId: id }, timeout);
    const response = await peer.next(timeout);
    if (peer.events.length) throw new Error('Unexpected EVENT on source connection');
    if (response.type !== 'BARRIER_ACK' || response.barrierId !== id || Object.keys(response).length !== 2)
      throw new Error(`Invalid BARRIER_ACK: ${JSON.stringify(response)}`);
  }
  async close() { for (const p of this.peers) p.socket.destroy();
    if (this.server.listening) await new Promise<void>(resolve => this.server.close(() => resolve())); }
}
export async function connect(port: number, timeout: number): Promise<Peer> {
  const socket = net.createConnection({ host: '127.0.0.1', port });
  const peer = new Peer(socket);
  try { await deadline(once(socket, 'connect'), timeout, 'subscriber connection'); return peer; }
  catch (e) { socket.destroy(); throw e; }
}
