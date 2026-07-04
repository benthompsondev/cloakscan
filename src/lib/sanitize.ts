import type { Finding } from './types';

/**
 * Build the cleaned output by splicing placeholders over enabled findings.
 * Everything outside a finding is copied byte-for-byte, so whitespace,
 * indentation, and line breaks are preserved exactly. Disabled findings
 * are left untouched.
 */
export function buildCleanText(text: string, findings: Finding[]): string {
  const active = findings
    .filter((f) => f.enabled)
    .sort((a, b) => a.start - b.start);

  let out = '';
  let cursor = 0;
  for (const finding of active) {
    if (finding.start < cursor) continue; // safety: skip anything overlapping
    out += text.slice(cursor, finding.start) + finding.placeholder;
    cursor = finding.end;
  }
  return out + text.slice(cursor);
}
