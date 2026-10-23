import { spawn } from 'node:child_process';
import type { Request } from './reference.js';
import { expected } from './reference.js';
import { differences } from './validator.js';
import { ResponseLines } from './jsonl.js';
import { parseResponse } from './parse-response.js';

export async function run(command: string, cases: Iterable<Request>, timeout: number, verbose = false): Promise<void> {
  // Only the explicit CLI command reaches the shell; fixture content is stdin data.
  const child = spawn(command, { shell: true, stdio: ['pipe', 'pipe', 'inherit'], detached: process.platform !== 'win32' });
  let failure: Error | undefined, response: ((line: string) => void) | undefined;
  let closed = false, requestId = 'startup';
  let abort!: (error: Error) => void;
  const fatal = new Promise<never>((_, reject) => { abort = reject; });
  // Errors may occur between requests; retain them without an unhandled rejection.
  void fatal.catch(() => {});
  const fail = (message: string) => {
    if (!failure) { failure = new Error(`${requestId}: ${message}`); abort(failure); }
  };
  child.on('error', error => fail(`Could not launch participant: ${error.message}`));
  child.stdin.on('error', error => fail(`Participant stdin: ${error.message}`));
  child.stdout.on('error', error => fail(`Participant stdout: ${error.message}`));
  const lines = new ResponseLines(line => {
    if (!response) throw new Error('Unsolicited or duplicate stdout response');
    const deliver = response; response = undefined; deliver(line);
  });
  child.stdout.on('data', (chunk: Buffer) => {
    if (failure) return;
    try { lines.push(chunk); } catch (error) { fail((error as Error).message); }
  });
  const close = new Promise<void>(resolve => child.on('close', (code, signal) => {
    closed = true;
    if (code !== 0) fail(`Participant exited with code ${code}, signal ${signal}`);
    else if (response) fail('Participant exited before responding');
    resolve();
  }));
  try {
    for (const request of cases) {
      requestId = request.requestId;
      if (failure) throw failure;
      if (closed) throw new Error(`${requestId}: Participant exited before all requests were sent`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      let line: string;
      try {
        line = await Promise.race([new Promise<string>(resolve => {
          response = resolve;
          timer = setTimeout(() => fail(`timed out after ${timeout} ms`), timeout);
          child.stdin.write(JSON.stringify(request) + '\n');
        }), fatal]);
      } finally { clearTimeout(timer); response = undefined; }
      if (failure) throw failure;
      let actual: unknown;
      try { actual = parseResponse(line); } catch (error) { throw new Error(`${requestId}: invalid JSON response (${(error as Error).message}): ${line.slice(0, 200)}`); }
      const diff = differences(expected(request), actual);
      if (diff.length) {
        const input = JSON.stringify(request);
        throw new Error(`${requestId}: state mismatch\n${diff.join('\n')}\nInput: ${input.slice(0, 2000)}${input.length > 2000 ? ' … (regenerate using seed and requestId)' : ''}`);
      }
      if (verbose) console.log(`PASS ${requestId} (${request.events.length} events)`);
    }
    requestId = 'shutdown';
    child.stdin.end();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([close, fatal, new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Participant did not exit after stdin EOF')), timeout);
      })]);
    } finally { clearTimeout(timer); }
    lines.finish();
    if (failure) throw failure;
  } finally {
    // Terminate before closing stdin: closing it first can let the shell exit
    // before taskkill has found its descendants.
    if (!closed && child.pid) {
      if (process.platform === 'win32') {
        await new Promise<void>(resolve => {
          const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
          const timer = setTimeout(() => { killer.kill(); child.kill(); resolve(); }, 2000);
          const done = () => { clearTimeout(timer); resolve(); };
          const fallback = () => {
            if (closed) return;
            child.kill();
            console.error('Cleanup warning: process-tree termination failed; check for remaining participant processes.');
          };
          killer.on('error', () => { fallback(); done(); });
          killer.on('close', code => { if (code !== 0) fallback(); done(); });
        });
      } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill('SIGKILL'); } }
      child.unref();
    }
    child.stdin.destroy(); child.stdout.destroy();
  }
}
