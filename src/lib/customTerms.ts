import type { Detector, RawMatch } from './types';
import { MAX_TERMS_PER_PACK, MAX_TERM_LENGTH } from './customPacks';

/**
 * Cloak terms: exact words or phrases the user wants redacted (organization
 * names, domains, hostnames, usernames, project names, team names — anything
 * built-in detection misses). "Hide custom terms" holds session-only terms; Cloak
 * Lists are reusable term-only custom packs.
 *
 * - One term per line, matched literally — never as a regular expression.
 * - Case-insensitive by default; optional case-sensitive mode.
 * - Exact words/phrases by default; matching inside longer words is an
 *   explicit, more aggressive opt-in.
 * - Session-only custom terms live only in React state. Cloak List terms follow the
 *   list's explicit save opt-in (on top of global preference storage).
 */

export interface TermsOptions {
  caseSensitive: boolean;
  matchInsideWords: boolean;
}

export const DEFAULT_TERMS_OPTIONS: TermsOptions = {
  caseSensitive: false,
  matchInsideWords: false,
};

export interface ParsedTerms {
  /** Clean, deduplicated, longest-first term list. */
  terms: string[];
  /** Line numbers (1-based) that duplicate an earlier term. */
  duplicates: number[];
  /** Line numbers (1-based) whose term is too short to use. */
  tooShort: number[];
  /** Line numbers (1-based) whose term exceeds MAX_TERM_LENGTH — skipped WHOLE, never truncated. */
  tooLong: number[];
  /** Line numbers (1-based) of valid terms beyond the MAX_TERMS_PER_PACK cap — not silently kept. */
  overLimit: number[];
}

/** Parse textarea input with per-line feedback for the editors. */
export function analyzePrivateTerms(input: string, caseSensitive = false): ParsedTerms {
  const seen = new Set<string>();
  const terms: string[] = [];
  const duplicates: number[] = [];
  const tooShort: number[] = [];
  const tooLong: number[] = [];
  const overLimit: number[] = [];
  input.split('\n').forEach((line, index) => {
    const term = line.trim();
    if (term.length === 0) return;
    if (term.length < 2) {
      tooShort.push(index + 1);
      return;
    }
    if (term.length > MAX_TERM_LENGTH) {
      // Never truncate: a partial term would silently match (and cloak)
      // something different from what the user typed.
      tooLong.push(index + 1);
      return;
    }
    const key = caseSensitive ? term : term.toLowerCase();
    if (seen.has(key)) {
      duplicates.push(index + 1);
      return;
    }
    if (terms.length >= MAX_TERMS_PER_PACK) {
      overLimit.push(index + 1);
      return;
    }
    seen.add(key);
    terms.push(term);
  });
  terms.sort((a, b) => b.length - a.length);
  return { terms, duplicates, tooShort, tooLong, overLimit };
}

/** Back-compat helper: just the clean term list. */
export function parsePrivateTerms(input: string, caseSensitive = false): string[] {
  return analyzePrivateTerms(input, caseSensitive).terms;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function flexibleLiteralPattern(literal: string): string {
  let pattern = '';
  let inWhitespace = false;
  for (const char of literal.normalize('NFC')) {
    if (/[ \t\u00a0]/u.test(char)) {
      if (!inWhitespace) pattern += '[ \\t\\u00a0]+';
      inWhitespace = true;
      continue;
    }
    inWhitespace = false;
    if (/['\u2018\u2019]/u.test(char)) {
      pattern += "['\\u2018\\u2019]";
    } else if (/[-\u2010-\u2015]/u.test(char)) {
      pattern += '[-\\u2010-\\u2015]';
    } else {
      pattern += escapeRegExp(char);
    }
  }
  return pattern;
}

function normalizeTermValue(value: string, caseSensitive: boolean): string {
  const canonical = value
    .normalize('NFC')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u2010-\u2015]/gu, '-')
    .replace(/[ \t\u00a0]+/gu, ' ');
  return caseSensitive ? canonical : canonical.toLocaleLowerCase();
}

/**
 * Build a one-off detector for a term list. `sourceName` distinguishes the
 * session dialog from pack-owned term sets in the findings list.
 */
export function createPrivateTermsDetector(
  terms: string[],
  options: TermsOptions = DEFAULT_TERMS_OPTIONS,
  sourceName = 'Custom term to hide',
): Detector {
  const flags = options.caseSensitive ? 'gu' : 'giu';
  const boundaryBefore = options.matchInsideWords ? '' : '(?<![\\p{L}\\p{N}])';
  const boundaryAfter = options.matchInsideWords ? '' : '(?![\\p{L}\\p{N}])';

  return {
    id: 'private-term',
    name: sourceName,
    category: 'personal',
    severity: 'high',
    label: 'CUSTOM_TERM',
    // Below specific detectors (email 70, URL 75, paths 72): when a term is
    // part of a larger sensitive value, the whole value wins and is redacted.
    priority: 58,
    explanation: 'An exact word or phrase you chose to cloak.',
    // Case variants share one placeholder in case-insensitive mode.
    normalizeValue: (value) => normalizeTermValue(value, options.caseSensitive),
    detect: (text): RawMatch[] => {
      const matches: RawMatch[] = [];
      for (const term of terms) {
        const re = new RegExp(
          `${boundaryBefore}${flexibleLiteralPattern(term)}${boundaryAfter}`,
          flags,
        );
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          matches.push({
            start: m.index,
            end: m.index + m[0].length,
            value: m[0],
            confidence: 'high',
          });
          if (m[0].length === 0) re.lastIndex += 1;
        }
      }
      return matches;
    },
  };
}
