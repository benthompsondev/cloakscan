import type { Finding } from './types';

/**
 * All user content lives in this in-memory shape and nowhere else.
 * No storage APIs are used, so a refresh (or Clear) discards everything —
 * including the session's custom terms to hide.
 */
export interface SessionState {
  sourceText: string;
  /** Raw session-only custom-term input, one literal term per line. */
  privateTermsInput: string;
  /** Session-only custom-term matching options (also memory-only). */
  termsCaseSensitive: boolean;
  termsMatchInsideWords: boolean;
  findings: Finding[];
  hasScanned: boolean;
}

export function createEmptySession(): SessionState {
  return {
    sourceText: '',
    privateTermsInput: '',
    termsCaseSensitive: false,
    // Exact words/phrases are the safe default; inside-word matching is an
    // explicit, more aggressive opt-in.
    termsMatchInsideWords: false,
    findings: [],
    hasScanned: false,
  };
}

/** Flip one finding's enabled state without mutating the original array. */
export function toggleFinding(findings: Finding[], id: string): Finding[] {
  return findings.map((f) => (f.id === id ? { ...f, enabled: !f.enabled } : f));
}
