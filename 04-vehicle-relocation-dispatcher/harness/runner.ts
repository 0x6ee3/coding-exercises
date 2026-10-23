import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type { Request } from './model.ts';
// One long-lived process, exactly one response per request, bounded output.
export async function run(command: string, requests: Request[], timeout: number): Promise<unknown[]> {
  const child = spawn(command,{shell:true,stdio:['pipe','pipe','pipe'], detached:process.platform!=='win32'});
  return new Promise((resolve,reject)=>{
    let buffer='', stderr='', index=0, done=false, timer: ReturnType<typeof setTimeout>;
    const outputs: unknown[]=[];
    const stop = () => {
      // Windows can leave a destroyed pipe's close pending while a descendant
      // still holds the other end. It must not keep the runner alive forever.
      for (const stream of [child.stdin,child.stdout,child.stderr]) {
        (stream as typeof stream & { unref?: () => void }).unref?.();
      }
      child.stdin.destroy(); child.stdout.destroy(); child.stderr.destroy(); child.unref();
      if (!child.pid) return;
      if (process.platform==='win32') { const killer=spawn(join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'),['/pid',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true,timeout:1000}); killer.on('error',()=>child.kill()); killer.on('exit',code=>{if(code!==0)child.kill();}); killer.unref(); }
      else { try { process.kill(-child.pid,'SIGKILL'); } catch { child.kill(); } }
    };
    const fail = (message: string) => { if(done)return; done=true; clearTimeout(timer); stop(); reject(new Error(`${message}${stderr?`\nstderr (tail): ${stderr}`:''}`)); };
    const arm = () => { clearTimeout(timer); timer=setTimeout(()=>fail(`Timeout after ${timeout} ms waiting for ${index<requests.length?requests[index].requestId:'participant exit'}`),timeout); };
    const send = () => { arm(); child.stdin.write(JSON.stringify(requests[index])+'\n'); };
    child.stderr.on('data',chunk=>{ stderr=(stderr+chunk.toString()).slice(-4096); });
    child.on('error',e=>fail(`Cannot launch command: ${e.message}`));
    child.stdin.on('error',e=>fail(`Participant stdin failed: ${e.message}`));
    child.stdout.setEncoding('utf8');
    child.stdout.on('data',(chunk: string)=>{
      if(done)return;
      buffer+=chunk;
      if(Buffer.byteLength(buffer)>2*1024*1024) return fail('stdout exceeds 2 MiB response limit');
      let newline: number;
      // Parse all lines in this chunk before sending another request: unsolicited output is rejected.
      let received=false;
      while((newline=buffer.indexOf('\n'))>=0) {
        const line=buffer.slice(0,newline).replace(/\r$/,''); buffer=buffer.slice(newline+1);
        if(index>=requests.length || received) return fail('Unexpected extra stdout line');
        try { outputs.push(JSON.parse(line)); } catch { return fail(`Invalid JSON response for ${requests[index].requestId}; stdout must contain JSONL only`); }
        index++; received=true;
      }
      if(received) {
        if(buffer.length) return fail('Unexpected partial extra stdout response');
        if(index===requests.length) { child.stdin.end(); arm(); } else send();
      }
    });
    child.on('close',(code,signal)=>{
      if(done)return;
      if(code!==0) return fail(`Participant exited with code ${code}, signal ${signal}`);
      if(buffer.length) return fail('Response must end with a newline');
      if(index!==requests.length) return fail(`Participant exited after ${index}/${requests.length} responses`);
      done=true; clearTimeout(timer); resolve(outputs);
    });
    if(requests.length) send(); else { child.stdin.end(); arm(); }
  });
}
