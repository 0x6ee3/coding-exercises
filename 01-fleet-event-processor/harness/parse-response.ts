// JSON.parse validates syntax; a second linear scan rejects ambiguous duplicate
// member names (including names made equivalent by JSON escapes).
export function parseResponse(line: string): unknown {
  const value: unknown = JSON.parse(line);
  const stack: ({ keys: Set<string>; key: boolean } | null)[] = [];
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      const start = i;
      while (++i < line.length) {
        if (line[i] === '\\') i++;
        else if (line[i] === '"') break;
      }
      const object = stack.at(-1);
      if (object?.key) {
        const name = JSON.parse(line.slice(start, i + 1)) as string;
        if (object.keys.has(name)) throw new Error(`Duplicate JSON member ${JSON.stringify(name)}`);
        object.keys.add(name); object.key = false;
      }
    } else if (char === '{') stack.push({ keys: new Set(), key: true });
    else if (char === '[') stack.push(null);
    else if (char === '}' || char === ']') stack.pop();
    else if (char === ',' && stack.at(-1)) stack.at(-1)!.key = true;
  }
  return value;
}
