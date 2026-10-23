import { isDeepStrictEqual } from 'node:util';
const preview = (value: unknown) => {
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  const text = JSON.stringify(value) ?? String(value);
  return text.length > 300 ? text.slice(0, 300) + ' …' : text;
};
export function differences(expected: unknown, actual: unknown, path = '$'): string[] {
  if (isDeepStrictEqual(expected, actual)) return [];
  if (Array.isArray(expected) && Array.isArray(actual)) {
    const result = expected.length === actual.length ? [] : [`${path}.length: expected ${expected.length}, actual ${actual.length}`];
    for (let i = 0; i < Math.min(expected.length, actual.length) && result.length < 12; i++) result.push(...differences(expected[i], actual[i], `${path}[${i}]`));
    return result.slice(0, 12);
  }
  if (expected && actual && typeof expected === 'object' && typeof actual === 'object' && !Array.isArray(expected) && !Array.isArray(actual)) {
    const e = expected as Record<string, unknown>, a = actual as Record<string, unknown>;
    return [...new Set([...Object.keys(e), ...Object.keys(a)])].flatMap(key =>
      !Object.hasOwn(a, key) ? [`${path}.${key}: missing`] : !Object.hasOwn(e, key) ? [`${path}.${key}: unexpected`] : differences(e[key], a[key], `${path}.${key}`)).slice(0, 12);
  }
  // JSON numbers compare numerically, including negative zero.
  if (typeof expected === 'number' && typeof actual === 'number' && expected === actual) return [];
  return [`${path}: expected ${preview(expected)}, actual ${preview(actual)}`];
}
