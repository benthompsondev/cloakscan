/**
 * Runs the frozen outsider corpus through the real scan pipeline on the
 * default Balanced profile, exactly as the web demo does.
 *
 * This is the non-PowerShell coverage gate: the private-corpus harness only
 * collects .ps1/.psm1/.psd1, so nothing else stopped the detector drifting
 * back toward PowerShell-only accuracy.
 */
import { describe, expect, it } from 'vitest';
import { OUTSIDER_CORPUS } from './outsiderCorpus';
import { buildCleanText, applyOutputMode, DEFAULT_OUTPUT_MODE } from './sanitize';
import { scanText } from './scan';

/** The default web experience: Balanced profile, Safe-share output. */
function sanitize(input: string): string {
  const findings = applyOutputMode(scanText(input), DEFAULT_OUTPUT_MODE);
  return buildCleanText(input, findings);
}

describe('outsider corpus', () => {
  it.each(OUTSIDER_CORPUS.map((c) => [c.id, c] as const))(
    'sanitizes %s as hand-written',
    (_id, testCase) => {
      expect(sanitize(testCase.input)).toBe(testCase.expected);
    },
  );

  it('never leaves a control case altered', () => {
    for (const testCase of OUTSIDER_CORPUS) {
      if (testCase.kind !== 'control') continue;
      expect(sanitize(testCase.input), `${testCase.id} was modified`).toBe(testCase.input);
    }
  });

  it('is stable when the sanitized output is scanned again', () => {
    for (const testCase of OUTSIDER_CORPUS) {
      const once = sanitize(testCase.input);
      expect(sanitize(once), `${testCase.id} drifted on rescan`).toBe(once);
    }
  });

  it('leaves no case with a bracket placeholder glued to leftover value text', () => {
    // Residue immediately after a placeholder is the signature of a partial
    // redaction: [API_KEY_1]-EXTRA, [API_KEY_1].tail. A following `key=value`
    // is a different field resuming, not a fragment.
    for (const testCase of OUTSIDER_CORPUS) {
      const out = sanitize(testCase.input);
      expect(out, `${testCase.id} looks partially redacted`).not.toMatch(
        /\[[A-Z][A-Z0-9_]*_\d+\](?![A-Za-z0-9_.-]{1,40}[=:])[A-Za-z0-9_$-]/,
      );
    }
  });
});
