// Harness verification fixture only; never a participant starter implementation.
import { createInterface } from 'node:readline';
import { reference } from '../reference.ts';
const mode = process.argv[2];
if (mode === 'exit') process.exit(7);
for await (const line of createInterface({ input: process.stdin })) {
  if (mode === 'hang') { await new Promise(() => { setInterval(() => {}, 1000); }); }
  else if (mode === 'junk') console.log('not json');
  else if (mode === 'extra') { console.log(JSON.stringify(reference(JSON.parse(line)))); console.log('{}'); }
  else if (mode === 'partial-extra') process.stdout.write(JSON.stringify(reference(JSON.parse(line))) + '\n{');
  else if (mode === 'utf8') process.stdout.write(Buffer.from([255, 10]));
  else if (mode === 'unterminated') process.stdout.write(JSON.stringify(reference(JSON.parse(line))));
  else if (mode === 'wrong') console.log('{}');
  else console.log(JSON.stringify(reference(JSON.parse(line))));
}
if (mode === 'nonzero-eof') process.exitCode = 9;
if (mode === 'hang-eof') setInterval(() => {}, 1000);
