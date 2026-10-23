import { spawn } from "node:child_process";
import type { Scenario } from "./model.js";

// One process per request; validate the complete stream so pipe chunking cannot affect grading.
export function runParticipant(command: string, scenario: Scenario, timeout: number): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, { shell: true, detached: process.platform !== "win32", windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const chunks: Buffer[] = [];
    let stderr = Buffer.alloc(0), bytes = 0, done = false;
    const finish = (error?: Error, value?: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        if (process.platform === "win32" && child.pid) {
          const killer = spawn((process.env.SystemRoot ?? "C:\\Windows") + "\\System32\\taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
          killer.on("error", () => child.kill());
          killer.unref();
        } else if (child.pid) {
          try { process.kill(-child.pid, "SIGKILL"); } catch { child.kill("SIGKILL"); }
        }
        child.stdin.destroy();
        child.stdout.destroy();
        child.stderr.destroy();
        child.unref();
        reject(error);
      } else resolve(value);
    };
    const timer = setTimeout(() => finish(new Error(`Timeout after ${timeout} ms; stderr: ${stderr.toString("utf8")}`)), timeout);
    child.on("error", error => finish(error));
    // Early exit can close stdin before the write completes. Grade the exit/output, not EPIPE timing.
    child.stdin.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") finish(error); });
    child.stderr.on("data", (chunk: Buffer) => { stderr = Buffer.concat([stderr, chunk]).subarray(-16384); });
    child.stdout.on("data", (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > 1048576) { finish(new Error("stdout exceeds 1 MiB limit")); return; }
      chunks.push(chunk);
    });
    child.on("close", (code, signal) => {
      if (done) return;
      if (code !== 0) { finish(new Error(`Participant exited (${code ?? signal}); stderr: ${stderr.toString("utf8")}`)); return; }
      let output: string;
      try { output = new TextDecoder("utf-8", {fatal:true, ignoreBOM:true}).decode(Buffer.concat(chunks)); }
      catch { finish(new Error("Response must be UTF-8")); return; }
      const newline = output.indexOf("\n");
      if (newline < 0) { finish(new Error("Participant exited without a complete JSONL response")); return; }
      if (!/^[\x20\t\r\n]*$/.test(output.slice(newline + 1))) { finish(new Error("Expected one JSONL response")); return; }
      try { finish(undefined, JSON.parse(output.slice(0, newline))); }
      catch { finish(new Error("Response line is not valid JSON")); }
    });
    child.stdin.end(JSON.stringify(scenario) + "\n");
  });
}

