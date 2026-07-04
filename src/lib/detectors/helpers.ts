import type { Confidence, RawMatch } from '../types';

/**
 * Run a global regex over text and return one RawMatch per hit.
 *
 * Options:
 * - group: capture-group index to report instead of the full match. The group
 *   may sit anywhere inside the overall match; its offset is resolved within
 *   the matched text so surrounding quotes and syntax remain untouched.
 * - confidenceFor: per-match confidence override (defaults to 'high').
 */
export function regexMatches(
  text: string,
  pattern: RegExp,
  options: {
    group?: number;
    confidenceFor?: (value: string) => Confidence | null;
  } = {},
): RawMatch[] {
  const { group, confidenceFor } = options;
  const matches: RawMatch[] = [];
  // Clone so a shared RegExp object never carries lastIndex between calls.
  const re = new RegExp(pattern.source, pattern.flags);
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Guard against zero-length matches looping forever.
    if (m[0].length === 0) {
      re.lastIndex += 1;
      continue;
    }
    const value = group !== undefined ? m[group] : m[0];
    if (!value) continue;
    const groupOffset = group !== undefined ? m[0].lastIndexOf(value) : 0;
    if (groupOffset < 0) continue;
    const start = m.index + groupOffset;
    const confidence = confidenceFor ? confidenceFor(value) : 'high';
    if (confidence === null) continue; // detector chose to skip this value
    matches.push({ start, end: start + value.length, value, confidence });
  }
  return matches;
}
