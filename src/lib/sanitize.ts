import type { Finding } from './types';

/**
 * Output modes.
 *
 * safe-share: every enabled finding becomes its bracket placeholder — right
 * for prompts, tickets, logs, issues, and general sharing.
 *
 * portfolio-code: findings that carry a code-safe identifier replacement
 * (Cloak List mapping entries matched in identifier position) are spliced as
 * that identifier instead, so PowerShell stays readable and valid-looking.
 * Everything else — string literals, secrets, emails, URLs, hosts, paths —
 * keeps its bracket placeholder.
 */
export type OutputMode = 'safe-share' | 'portfolio-code';

export const DEFAULT_OUTPUT_MODE: OutputMode = 'safe-share';

/**
 * Resolve the output mode into the findings themselves: in portfolio-code
 * mode a finding with a code-safe replacement swaps it in as the effective
 * placeholder. Downstream (clean text, preview, findings list) then works
 * unchanged. Pure — never mutates the input.
 */
export function applyOutputMode(findings: Finding[], mode: OutputMode): Finding[] {
  if (mode !== 'portfolio-code') return findings;
  return findings.map((f) =>
    f.replacement !== undefined ? { ...f, placeholder: f.replacement } : f,
  );
}

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
