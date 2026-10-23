export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

// Bound each wire line, rather than the size of an arbitrary OS pipe chunk.
export class ResponseLines {
  private fragments: Buffer[] = [];
  private size = 0;
  private decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  constructor(private deliver: (line: string) => void, private limit = MAX_RESPONSE_BYTES) {}
  push(chunk: Buffer): void {
    let start = 0;
    while (start < chunk.length) {
      const newline = chunk.indexOf(10, start);
      const end = newline < 0 ? chunk.length : newline;
      const fragment = chunk.subarray(start, end);
      this.size += fragment.length;
      if (this.size > this.limit) throw new Error(`Response exceeds ${this.limit} bytes`);
      this.fragments.push(fragment);
      if (newline < 0) return;
      const bytes = Buffer.concat(this.fragments, this.size);
      this.fragments = []; this.size = 0;
      let line: string;
      try { line = this.decoder.decode(bytes); }
      catch { throw new Error('Response is not valid UTF-8'); }
      this.deliver(line.replace(/\r$/, ''));
      start = newline + 1;
    }
  }
  finish(): void {
    if (this.size) throw new Error('Trailing stdout without a newline');
  }
}
