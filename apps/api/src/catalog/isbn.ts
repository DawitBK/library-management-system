/**
 * Normalize an ISBN to digits (and a trailing X for ISBN-10) and verify its check digit.
 * Returns the canonical string, or `undefined` when the input is not a valid ISBN-10 or ISBN-13.
 */
export function normalizeIsbn(input: string): string | undefined {
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^\d{9}[\dX]$/.test(compact)) {
    let sum = 0;
    for (let i = 0; i < 10; i += 1) {
      const ch = compact[i]!;
      sum += (10 - i) * (ch === 'X' ? 10 : Number(ch));
    }
    return sum % 11 === 0 ? compact : undefined;
  }
  if (/^\d{13}$/.test(compact)) {
    let sum = 0;
    for (let i = 0; i < 13; i += 1) sum += Number(compact[i]) * (i % 2 === 0 ? 1 : 3);
    return sum % 10 === 0 ? compact : undefined;
  }
  return undefined;
}
