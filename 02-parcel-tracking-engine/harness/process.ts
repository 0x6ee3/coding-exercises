import { spawn } from 'node:child_process';
// One long-lived process, one outstanding request, bounded stdout and stderr.
export function startParticipant(command: string | undefined, timeout: number) {
  const child = spawn(command ?? process.execPath, command === undefined ? ['participant/main.ts'] : [], {
    shell: command !== undefined, stdio: ['pipe', 'pipe', 'pipe'], detached: process.platform !== 'win32', windowsHide: true,
  });
  let buffer = '', stderr = '', closing = false;
  let pending: { resolve: (value: unknown) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> } | null = null;
  let failure: Error | null = null;
  const fail = (error: Error) => { failure ??= error; if (pending) { const p = pending; pending = null; clearTimeout(p.timer); p.reject(failure); } };
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', data => { stderr = (stderr + data).slice(-8192); });
  child.stdout.on('data', data => {
    if (failure) return;
    if (!pending) { fail(new Error('Unsolicited stdout data')); return; }
    try { buffer += decoder.decode(data, { stream: true }); }
    catch { fail(new Error('stdout is not valid UTF-8')); return; }
    if (Buffer.byteLength(buffer) > 32 * 1024 * 1024) { fail(new Error('stdout exceeded 32 MiB')); return; }
    let pos;
    while ((pos = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, pos).replace(/\r$/, ''); buffer = buffer.slice(pos + 1);
      if (!pending) { fail(new Error('Unsolicited or extra stdout line')); continue; }
      const p = pending; pending = null; clearTimeout(p.timer);
      try { p.resolve(JSON.parse(line)); } catch { const e = new Error(`Invalid JSON response: ${line.slice(0, 200)}`); failure = e; p.reject(e); }
    }
    if (!pending && buffer.length) fail(new Error('Unsolicited trailing stdout data'));
  });
  child.stdout.on('end', () => { try { decoder.decode(); } catch { fail(new Error('stdout ends with incomplete UTF-8')); } });
  child.on('error', fail);
  child.stdin.on('error', fail);
  child.on('exit', (code, signal) => { if (!closing || pending) fail(new Error(`Participant exited (code=${code}, signal=${signal})`)); });
  return {
    async request(value: unknown): Promise<unknown> {
      if (failure) throw failure;
      if (pending) throw new Error('Only one request may be in flight');
      return new Promise<unknown>((resolve, reject) => {
        pending = { resolve, reject, timer: setTimeout(() => fail(new Error(`Response timeout after ${timeout} ms`)), timeout) };
        child.stdin.write(JSON.stringify(value) + '\n', error => { if (error) fail(error); });
      });
    },
    async finish() {
      if (failure) throw failure;
      closing = true;
      const exited = new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Participant did not exit within ${timeout} ms after EOF`)), timeout);
        child.once('close', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Participant exited with code ${code}`)); });
      });
      child.stdin.end();
      await exited;
      if (failure) throw failure;
      if (buffer.length) throw new Error('Trailing stdout without newline');
    },
    stderr: () => stderr,
    stop() {
      closing = true;
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy();
      child.unref();
      if (child.exitCode !== null || child.pid === undefined) return;
      if (process.platform === 'win32') {
        const killer = spawn(`${process.env.SystemRoot || 'C:\\Windows'}\\System32\\taskkill.exe`, ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        killer.on('error', () => child.kill());
        killer.unref();
      } else { try { process.kill(-child.pid, 'SIGKILL'); } catch { child.kill(); } }
    },
  };
}
