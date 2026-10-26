import { isDeepStrictEqual } from 'node:util';
export function difference(expected: unknown, actual: unknown, path = '$'): string | null {
  if (expected === actual) return null; // JSON numbers compare by value, including signed zero.
  if (isDeepStrictEqual(expected, actual)) return null;
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') return `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
  if (Array.isArray(expected) !== Array.isArray(actual)) return `${path}: wrong container type`;
  if (Array.isArray(expected) && Array.isArray(actual) && expected.length !== actual.length) return `${path}.length: expected ${expected.length}, received ${actual.length}`;
  const ek = Object.keys(expected).sort(), ak = Object.keys(actual).sort();
  if (!isDeepStrictEqual(ek, ak)) return `${path}: expected keys ${ek}, received keys ${ak}`;
  for (const key of Object.keys(expected)) { const d = difference((expected as Record<string, unknown>)[key], (actual as Record<string, unknown>)[key], `${path}[${JSON.stringify(key)}]`); if (d) return d; }
  return null;
}
