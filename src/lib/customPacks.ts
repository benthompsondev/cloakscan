import type { Category, Detector, RawMatch, Severity } from './types';
import type { RedactionChoice } from './redaction';
import type { CloakMappingEntry } from './cloakMappings';

/**
 * Custom packs: user-defined bundles of registry detector ids, safe custom
 * labeled-field rules, and an optional cloak-terms set. Packs are enabled
 * per-profile; the pack's own `enabled` flag is a master switch.
 *
 * Custom rules support exactly one detector type — labeled field — with no
 * user regex anywhere. Matching is same-line only and skips anything that
 * looks like executable code.
 */

export type CustomValueType = 'digits' | 'identifier' | 'text';

export interface CustomFieldRule {
  id: string;
  name: string;
  /** 1-10 literal field labels, matched case-insensitively before : or =. */
  labels: string[];
  valueType: CustomValueType;
  /** Uppercase letters, numbers, underscores; becomes [LABEL_n]. */
  placeholderLabel: string;
  category: Category;
  severity: Severity;
  /** Upper bound on the captured value length (1-200). */
  maxLength: number;
  enabled: boolean;
}

export interface PackTerms {
  values: string[];
  caseSensitive: boolean;
  matchInsideWords: boolean;
  /** Explicit, separate opt-in to persist term VALUES with the pack. */
  saveTerms: boolean;
  /** Optional Cloak List-only output format. Missing means indexed default. */
  termFormat?: RedactionChoice;
  /** Optional Cloak List-only placeholder label. Missing means CUSTOM_TERM. */
  termLabel?: string;
  /**
   * Optional mapping entries (term -> replacement with category, severity,
   * match behavior, code-safe flag). Mapping TERMS are as sensitive as plain
   * term values, so they follow the same saveTerms persistence opt-in.
   */
  mappings?: CloakMappingEntry[];
}

export interface CustomPack {
  id: string;
  name: string;
  description?: string;
  /** Registry detector ids this pack enables. */
  detectorIds: string[];
  rules: CustomFieldRule[];
  terms: PackTerms;
  enabled: boolean;
}

export const MAX_CUSTOM_PACKS = 20;
export const MAX_RULES_PER_PACK = 20;
export const MAX_TERMS_PER_PACK = 100;
export const MAX_TERM_LENGTH = 120;
export const MAX_CLOAK_LIST_IMPORT_BYTES = 256 * 1024;
export const MAX_LABELS_PER_RULE = 10;
export const MAX_CAPTURE_LENGTH = 200;

export const PLACEHOLDER_LABEL_RE = /^[A-Z][A-Z0-9_]{0,19}$/;

/**
 * A "Cloak List" is a term-only custom pack: no registry rules and no
 * labeled-field rules. Same model, same persistence rules — the distinction
 * is purely presentational.
 */
export function isCloakList(pack: CustomPack): boolean {
  return pack.detectorIds.length === 0 && pack.rules.length === 0;
}

/**
 * Why a NEW Cloak List cannot be saved yet, or null if it can. Only creation
 * requires a term: an existing list may legitimately be edited or cleared,
 * because term values that were never opted into local save vanish on reload.
 */
export function cloakListSaveBlocker(isNew: boolean, validTermCount: number): string | null {
  if (isNew && validTermCount === 0) {
    return 'Add at least one valid term to create this Cloak List — an empty list has nothing to cloak.';
  }
  return null;
}

/**
 * Why an advanced Custom Pack cannot be saved, or null if it can. A pack with
 * neither a registry rule nor a labeled-field rule is a terms-only collection,
 * which belongs in Cloak Lists (and would be classified as one by isCloakList).
 */
export function customPackSaveBlocker(detectorCount: number, ruleCount: number): string | null {
  if (detectorCount === 0 && ruleCount === 0) {
    return 'Add at least one registry rule or labeled-field rule. For a terms-only collection, create a Cloak List instead.';
  }
  return null;
}

export function emptyPackTerms(): PackTerms {
  // Exact words/phrases (matchInsideWords off) are the safe default for new
  // lists; inside-word matching is an explicit, more aggressive opt-in.
  return { values: [], caseSensitive: false, matchInsideWords: false, saveTerms: false };
}

export interface CloakListTextParseResult {
  terms: string[];
  added: number;
  droppedEmpty: number;
  droppedDuplicate: number;
  droppedTooLong: number;
  capped: boolean;
}

export function parseCloakListText(
  text: string,
  existingTerms: readonly string[] = [],
  caseSensitive = false,
): CloakListTextParseResult {
  const terms = [...existingTerms];
  const seen = new Set(
    existingTerms.map((term) => (caseSensitive ? term : term.toLocaleLowerCase())),
  );
  let added = 0;
  let droppedEmpty = 0;
  let droppedDuplicate = 0;
  let droppedTooLong = 0;
  let capped = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const term = rawLine.trim();
    if (term.length === 0) {
      droppedEmpty += 1;
      continue;
    }
    if (term.length > MAX_TERM_LENGTH) {
      droppedTooLong += 1;
      continue;
    }
    const key = caseSensitive ? term : term.toLocaleLowerCase();
    if (seen.has(key)) {
      droppedDuplicate += 1;
      continue;
    }
    if (terms.length >= MAX_TERMS_PER_PACK) {
      capped = true;
      break;
    }
    terms.push(term);
    seen.add(key);
    added += 1;
  }

  return { terms, added, droppedEmpty, droppedDuplicate, droppedTooLong, capped };
}

export function summarizeCloakListImport(result: CloakListTextParseResult): string {
  const parts = [`Imported ${result.added} term${result.added === 1 ? '' : 's'}`];
  const dropped = result.droppedDuplicate + result.droppedTooLong;
  if (dropped > 0) parts.push(`skipped ${dropped}`);
  if (result.capped) parts.push(`stopped at ${MAX_TERMS_PER_PACK}`);
  parts.push('content stays in memory only');
  return `${parts.join(' — ')}.`;
}

/** Validate one custom rule. Returns a user-facing error or null. */
export function validateCustomRule(rule: CustomFieldRule): string | null {
  if (rule.name.trim().length === 0) return 'Rule name cannot be empty.';
  if (rule.name.length > 40) return 'Rule name must be 40 characters or fewer.';
  const labels = rule.labels.map((l) => l.trim()).filter((l) => l.length > 0);
  if (labels.length === 0) return 'At least one field label is required.';
  if (labels.length > MAX_LABELS_PER_RULE) return `At most ${MAX_LABELS_PER_RULE} labels.`;
  if (labels.some((l) => l.length > 40)) return 'Labels must be 40 characters or fewer.';
  if (labels.some((l) => /[\r\n]/.test(l))) return 'Labels cannot contain line breaks.';
  if (!PLACEHOLDER_LABEL_RE.test(rule.placeholderLabel)) {
    return 'Placeholder must be uppercase letters, numbers, and underscores (e.g. BADGE_ID).';
  }
  if (!Number.isInteger(rule.maxLength) || rule.maxLength < 1 || rule.maxLength > MAX_CAPTURE_LENGTH) {
    return `Maximum length must be between 1 and ${MAX_CAPTURE_LENGTH}.`;
  }
  return null;
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const VALUE_PATTERNS: Record<CustomValueType, string> = {
  digits: String.raw`\d[\d \-]*`,
  identifier: String.raw`[A-Za-z0-9][A-Za-z0-9._\-]*`,
  text: String.raw`[^\r\n]+`,
};

/** Values that look like code must never be replaced. */
function looksExecutable(value: string): boolean {
  if (/^[$(&`]/.test(value)) return true; // variable, expression, call operator
  if (/^[A-Za-z]+-[A-Za-z]+$/.test(value)) return true; // lone Verb-Noun cmdlet shape
  return false;
}

export interface FieldRuleScanResult {
  matches: RawMatch[];
  /**
   * Complete candidates skipped because they exceed the rule's maxLength.
   * An over-limit value is never truncated or partially redacted — it is
   * left entirely untouched and reported here so the UI can explain why.
   */
  skippedTooLong: { start: number; length: number }[];
}

/**
 * Run one custom rule over the text. The label matcher is assembled from
 * escaped literals — the user never supplies regex. Same-line only: gaps use
 * [ \t] and values exclude CR/LF. When the value opens with a quote and the
 * matching close quote is on the same line, only the content INSIDE the
 * quotes is a candidate; an unclosed quote falls back to the rest of the
 * line after the opening quote.
 */
export function scanFieldRule(rule: CustomFieldRule, text: string): FieldRuleScanResult {
  const labels = rule.labels
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  const labelRe = new RegExp(
    String.raw`(?<![A-Za-z0-9_])(?:${labels})[ \t]*[:=][ \t]*`,
    'gi',
  );
  const valueRe = new RegExp(`^(?:${VALUE_PATTERNS[rule.valueType]})`);

  const matches: RawMatch[] = [];
  const skippedTooLong: FieldRuleScanResult['skippedTooLong'] = [];
  let m: RegExpExecArray | null;
  while ((m = labelRe.exec(text)) !== null) {
    const valueStart = m.index + m[0].length;
    let lineEnd = valueStart;
    while (lineEnd < text.length && text[lineEnd] !== '\r' && text[lineEnd] !== '\n') lineEnd += 1;

    let candidateStart = valueStart;
    let candidate: string;
    const first = text[valueStart];
    if (first === '"' || first === "'") {
      const close = text.indexOf(first, valueStart + 1);
      candidateStart = valueStart + 1;
      candidate =
        close !== -1 && close < lineEnd
          ? text.slice(candidateStart, close) // matched quotes: inside only
          : text.slice(candidateStart, lineEnd); // unclosed quote: rest of the line
    } else {
      candidate = text.slice(valueStart, lineEnd);
    }

    const vm = valueRe.exec(candidate);
    if (vm === null) continue;
    const value = vm[0].trimEnd();
    if (value.length === 0 || looksExecutable(value)) continue;
    if (value.length > rule.maxLength) {
      // Skip the ENTIRE candidate: replacing only a prefix would leave part
      // of the sensitive value in output that looks fully sanitized.
      skippedTooLong.push({ start: candidateStart, length: value.length });
      labelRe.lastIndex = candidateStart + value.length;
      continue;
    }
    matches.push({ start: candidateStart, end: candidateStart + value.length, value, confidence: 'medium' });
    labelRe.lastIndex = candidateStart + value.length;
  }
  return { matches, skippedTooLong };
}

/** Build a real Detector from a custom rule. */
export function createFieldRuleDetector(packId: string, rule: CustomFieldRule): Detector {
  return {
    id: `custom:${packId}:${rule.id}`,
    name: rule.name,
    category: rule.category,
    severity: rule.severity,
    label: rule.placeholderLabel,
    priority: 53, // participates in normal overlap resolution, below specific built-ins
    explanation: `Custom labeled-field rule from one of your packs.`,
    detect: (text): RawMatch[] => scanFieldRule(rule, text).matches,
  };
}

/** All active extra detectors contributed by a set of custom packs. */
export function detectorsFromCustomPacks(
  packs: readonly CustomPack[],
  activePackIds: readonly string[],
): Detector[] {
  const result: Detector[] = [];
  for (const pack of packs) {
    if (!pack.enabled || !activePackIds.includes(pack.id)) continue;
    for (const rule of pack.rules) {
      if (rule.enabled && validateCustomRule(rule) === null) {
        result.push(createFieldRuleDetector(pack.id, rule));
      }
    }
  }
  return result;
}
