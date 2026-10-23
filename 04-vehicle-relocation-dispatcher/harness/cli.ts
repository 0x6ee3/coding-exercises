import { generate } from './generate.ts';
import { baseline } from './baseline.ts';
import { validate } from './model.ts';
import { run } from './runner.ts';
try {
  const args=process.argv.slice(2), options: Record<string,string>={};
  let verbose=false;
  for(let i=0;i<args.length;i++) {
    const key=args[i];
    if(key==='--verbose') { verbose=true; continue; }
    if(!['--command','--seed','--cases','--timeout'].includes(key) || !args[i+1]) throw new Error(`Unknown option or missing value: ${key}`);
    options[key]=args[++i];
  }
  if(!options['--command']) throw new Error('Usage: npm run test -- --command "node participant/main.js" [--seed 1] [--cases 24] [--verbose] [--timeout 2000]');
  const number = (key: string, fallback: number, min: number, max: number) => {
    const value=options[key]===undefined?fallback:Number(options[key]);
    if(!Number.isSafeInteger(value)||value<min||value>max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
    return value;
  };
  const seed=number('--seed',1,0,4294967295), cases=number('--cases',24,1,10000), timeout=number('--timeout',2000,1,2147483647);
  const requests=generate(seed,cases);
  const outputs=await run(options['--command'],requests,timeout);
  let failed=0,total=0,reference=0;
  requests.forEach((request,i)=>{
    const b=validate(request,baseline(request)); reference+=b.score;
    try {
      const result=validate(request,outputs[i]); total+=result.score;
      console.log(`PASS ${request.requestId}: score=${result.score.toFixed(2)} shortage=${result.initialShortage}->${result.finalShortage} distance=${result.totalDistanceKm.toFixed(3)}km baseline=${b.score.toFixed(2)}`);
      if(verbose) console.log(JSON.stringify({metrics:result,baseline:b}));
    } catch(e) { failed++; console.error(`FAIL ${request.requestId}: ${(e as Error).message}`); if(verbose) console.error(JSON.stringify(outputs[i])); }
  });
  console.log(`${cases-failed}/${cases} valid; mean score=${(total/cases).toFixed(2)}/100; greedy reference=${(reference/cases).toFixed(2)}/100; seed=${seed}`);
  if(failed) process.exitCode=1;
} catch(e) { console.error((e as Error).message); process.exitCode=1; }
