// Intentionally handles only empty datasets. Never a fleet implementation.
import { createInterface } from 'node:readline';
const mode = process.argv[2] ?? 'empty';
if (mode === 'exit') process.exit(3);
const input = createInterface({ input: process.stdin });
input.on('close', () => {
  if (mode === 'hang-eof') setInterval(() => {}, 1000);
  if (mode === 'nonzero-eof') process.exitCode = 3;
  if (mode === 'extra-eof') console.log('{}');
  if (mode === 'trailing-eof') process.stdout.write(' ');
});
input.on('line', line => {
  const request = JSON.parse(line);
  if (mode === 'silent') return;
  if (mode === 'malformed') { console.log('not json'); return; }
  if (mode === 'stderr') console.error('fixture debug message');
  const response = JSON.stringify({ vehicles: [], requestId: request.requestId });
  if (mode === 'crlf') { process.stdout.write(response + '\r\n'); return; }
  if (mode === 'split') {
    process.stdout.write(response.slice(0, 5));
    setTimeout(() => process.stdout.write(response.slice(5) + '\n'), 10); return;
  }
  if (mode === 'duplicate-key') { console.log(`{"vehicles":[1],"vehicles":[],"requestId":${JSON.stringify(request.requestId)}}`); return; }
  if (mode === 'extra-field') { console.log(JSON.stringify({ vehicles: [], requestId: request.requestId, extra: 1 })); return; }
  if (mode === 'wrong-id') { console.log(JSON.stringify({ vehicles: [], requestId: 'wrong' })); return; }
  if (mode === 'blank') { console.log(''); return; }
  if (mode === 'oversized') { process.stdout.write(' '.repeat(8 * 1024 * 1024 + 1)); return; }
  if (mode === 'partial') { process.stdout.write(response); return; }
  console.log(response);
  if (mode === 'early-exit') process.exit(0);
  if (mode === 'duplicate') console.log(response);
});
