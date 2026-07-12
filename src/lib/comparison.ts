import type { Finding } from './types';
import { applyOutputMode, buildCleanText } from './sanitize';

/**
 * Side-by-side output-mode comparison, computed from findings that already
 * exist. No detector runs here — both versions are pure splices of the same
 * scan result, so opening or switching the comparison can never rescan.
 * Only sanitized text leaves this module: original matched values appear in
 * neither output nor any metadata field.
 */
export interface ModeComparison {
  /** Sanitized output with every enabled finding as a bracket placeholder. */
  safeShare: string;
  /** Sanitized output with code-safe identifier replacements applied. */
  portfolioCode: string;
  /** How many lines differ between the two sanitized versions. */
  changedLineCount: number;
}

export function compareOutputModes(sourceText: string, findings: Finding[]): ModeComparison {
  const safeShare = buildCleanText(sourceText, applyOutputMode(findings, 'safe-share'));
  const portfolioCode = buildCleanText(sourceText, applyOutputMode(findings, 'portfolio-code'));

  const a = safeShare.split('\n');
  const b = portfolioCode.split('\n');
  let changedLineCount = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if (a[i] !== b[i]) changedLineCount += 1;
  }

  return { safeShare, portfolioCode, changedLineCount };
}
