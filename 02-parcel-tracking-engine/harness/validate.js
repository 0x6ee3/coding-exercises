import { isDeepStrictEqual } from 'node:util';
export function difference(expected, actual, path = '$') {
  if (expected === actual) return null; // JSON numbers compare by value, including signed zero.
  if (isDeepStrictEqual(expected, actual)) return null;
  if (expected === null || actual === null || typeof expected !== 'object' || typeof actual !== 'object') return `${path}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`;
  if (Array.isArray(expected) !== Array.isArray(actual)) return `${path}: wrong container type`;
  if (Array.isArray(expected) && expected.length !== actual.length) return `${path}.length: expected ${expected.length}, received ${actual.length}`;
  const ek = Object.keys(expected).sort(), ak = Object.keys(actual).sort();
  if (!isDeepStrictEqual(ek, ak)) return `${path}: expected keys ${ek}, received keys ${ak}`;
  for (const key of Object.keys(expected)) { const d = difference(expected[key], actual[key], `${path}[${JSON.stringify(key)}]`); if (d) return d; }
  return null;
}
