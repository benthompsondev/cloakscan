import type { Category, Detector, RawMatch, Severity } from './types';
import {
  REPLACEMENT_IDENTIFIER_RE,
  codeSafeReplacementFor,
  findPowerShellStringRanges,
} from './codeSafe';
import {
  DEFAULT_CUSTOM_TERM_LABEL,
  DEFAULT_TEMPLATE,
  sanitizePlaceholderLabel,
  validateTemplate,
} from './redaction';

/**
 * Cloak List mapping entries: reusable term -> replacement rules with their
 * own category, severity, match behavior, and an opt-in code-safe flag.
 *
 * A mapping is still just literal matching — never a regular expression. The
 * replacement only ever applies in Portfolio-code mode, in identifier
 * position, outside string literals; everywhere else the entry behaves like a
 * plain cloak term and produces a bracket placeholder.
 */

export type MappingMatchMode = 'literal' | 'ci-literal' | 'word';

/**
 * What a matched term turns into.
 *
 * placeholder      always a bracket placeholder, in both output modes.
 * code-only        Portfolio-code mode swaps the replacement in when the term
 *                  sits in identifier position outside string literals;
 *                  everywhere else it stays a placeholder.
 * genericize       Portfolio-code mode swaps the replacement in everywhere —
 *                  identifiers keep their casing adapted, prose and string
 *                  literals get the replacement as written.
 * review-lead      the match is flagged only: it starts disabled and never
 *                  rewrites output until the user opts in (then: placeholder).
 */
export type MappingStrategy = 'placeholder' | 'code-only' | 'genericize' | 'review-lead';

export interface CloakMappingEntry {
  id: string;
  /** Literal term to find (an org name, project codename, prefix, ...). */
  term: string;
  /** Generic identifier to substitute in Portfolio-code mode. '' = none. */
  replacement: string;
  /** Display category label; mapped onto an engine category for grouping. */
  categoryLabel: string;
  severity: Severity;
  matchMode: MappingMatchMode;
  /**
   * Kept for storage/file compatibility with 1.3 builds; `strategy` is
   * authoritative. True mirrors code-only/genericize.
   */
  codeSafe: boolean;
  strategy: MappingStrategy;
}

export const MAX_MAPPINGS_PER_LIST = 100;
export const MAX_MAPPING_TERM_LENGTH = 120;

export const MATCH_MODES: { id: MappingMatchMode; name: string }[] = [
  { id: 'ci-literal', name: 'Case-insensitive' },
  { id: 'literal', name: 'Exact case' },
  { id: 'word', name: 'Whole word' },
];

export const MAPPING_STRATEGIES: { id: MappingStrategy; name: string; hint: string }[] = [
  {
    id: 'code-only',
    name: 'Code identifiers only',
    hint: 'Replacement inside variable/function/command names; placeholder everywhere else.',
  },
  {
    id: 'genericize',
    name: 'Genericize everywhere',
    hint: 'Replacement everywhere in Portfolio-code mode, including prose and strings.',
  },
  {
    id: 'placeholder',
    name: 'Placeholder',
    hint: 'Always a bracket placeholder, in both output modes.',
  },
  {
    id: 'review-lead',
    name: 'Review lead only',
    hint: 'Flag matches for review — nothing is rewritten until you enable the finding.',
  },
];

/** Suggested entry categories, each mapped to an engine grouping category. */
export const CLOAK_ENTRY_CATEGORIES: { label: string; category: Category }[] = [
  { label: 'Organization', category: 'organization' },
  { label: 'Workflow', category: 'workflow' },
  { label: 'Code Identifier', category: 'code' },
  { label: 'Internal Application', category: 'organization' },
  { label: 'Access Group', category: 'directory' },
  { label: 'License Group', category: 'directory' },
  { label: 'Healthcare Identifier', category: 'personal' },
  { label: 'Ticketing System', category: 'workflow' },
  { label: 'Person / Initials', category: 'personal' },
  { label: 'Internal File Name', category: 'paths' },
  { label: 'Internal Script Name', category: 'code' },
  { label: 'CSV Schema / Identity Field', category: 'workflow' },
  { label: 'Directory Attribute', category: 'directory' },
  { label: 'Messaging / Exchange Workflow', category: 'messaging' },
  { label: 'Credential Workflow', category: 'secrets' },
  { label: 'State / Audit Artifact', category: 'workflow' },
  { label: 'Review Lead', category: 'organization' },
];

export function categoryForLabel(label: string): Category {
  return (
    CLOAK_ENTRY_CATEGORIES.find((c) => c.label === label)?.category ?? 'organization'
  );
}

export function emptyMappingEntry(id: string): CloakMappingEntry {
  return {
    id,
    term: '',
    replacement: '',
    categoryLabel: 'Organization',
    severity: 'medium',
    // Case-insensitive substring matching is the useful default for terms
    // embedded in identifiers (NirvAccess, Enable-NirvAccount).
    matchMode: 'ci-literal',
    codeSafe: true,
    strategy: 'code-only',
  };
}

/** Validate one mapping entry. Returns a user-facing error, or null. */
export function validateMappingEntry(entry: CloakMappingEntry): string | null {
  const term = entry.term.trim();
  if (term.length < 2) return 'Term must be at least 2 characters.';
  if (term.length > MAX_MAPPING_TERM_LENGTH) {
    return `Term must be ${MAX_MAPPING_TERM_LENGTH} characters or fewer.`;
  }
  if (/[\r\n]/.test(term)) return 'Term cannot contain line breaks.';
  if (entry.replacement !== '' && !REPLACEMENT_IDENTIFIER_RE.test(entry.replacement)) {
    return 'Replacement must be a plain identifier: letters, numbers, underscores, hyphens.';
  }
  if (
    entry.replacement === '' &&
    (entry.strategy === 'code-only' || entry.strategy === 'genericize')
  ) {
    return 'This strategy needs a replacement identifier (e.g. SourceSystem).';
  }
  return null;
}

const SEVERITIES: Severity[] = ['high', 'medium', 'low'];
const MATCH_MODE_IDS: MappingMatchMode[] = ['literal', 'ci-literal', 'word'];
const STRATEGY_IDS: MappingStrategy[] = ['placeholder', 'code-only', 'genericize', 'review-lead'];

/**
 * Rebuild one mapping entry from untrusted data (stored preferences or an
 * imported file), allowlist-only. Returns null when no valid entry can be
 * recovered — malformed entries are dropped, never repaired into something
 * the user did not write.
 */
export function cleanMappingEntry(raw: unknown, fallbackId: string): CloakMappingEntry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const replacement =
    typeof data.replacement === 'string' && REPLACEMENT_IDENTIFIER_RE.test(data.replacement)
      ? data.replacement
      : '';
  // 1.3 data has no strategy field — derive it from the codeSafe flag so
  // stored lists and exported files keep their exact old behavior.
  const strategy = STRATEGY_IDS.includes(data.strategy as MappingStrategy)
    ? (data.strategy as MappingStrategy)
    : data.codeSafe !== false && replacement !== ''
      ? 'code-only'
      : 'placeholder';
  const entry: CloakMappingEntry = {
    id:
      typeof data.id === 'string' && data.id.length > 0 && data.id.length <= 60
        ? data.id
        : fallbackId,
    term: typeof data.term === 'string' ? data.term.trim() : '',
    replacement,
    categoryLabel: CLOAK_ENTRY_CATEGORIES.some((c) => c.label === data.categoryLabel)
      ? (data.categoryLabel as string)
      : 'Organization',
    severity: SEVERITIES.includes(data.severity as Severity)
      ? (data.severity as Severity)
      : 'medium',
    matchMode: MATCH_MODE_IDS.includes(data.matchMode as MappingMatchMode)
      ? (data.matchMode as MappingMatchMode)
      : 'ci-literal',
    codeSafe: strategy === 'code-only' || strategy === 'genericize',
    strategy,
  };
  return validateMappingEntry(entry) === null ? entry : null;
}

/** Entries that pass validation, deduplicated by (term, matchMode). */
export function usableMappings(entries: readonly CloakMappingEntry[]): CloakMappingEntry[] {
  const seen = new Set<string>();
  const out: CloakMappingEntry[] = [];
  for (const entry of entries) {
    if (validateMappingEntry(entry) !== null) continue;
    const key = `${entry.matchMode}\u0000${
      entry.matchMode === 'literal' ? entry.term.trim() : entry.term.trim().toLowerCase()
    }`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...entry, term: entry.term.trim() });
    if (out.length >= MAX_MAPPINGS_PER_LIST) break;
  }
  // Longest term first so NirvSystem beats Nirv on the same span.
  return out.sort((a, b) => b.term.length - a.term.length);
}

function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface MappingDetectorOptions {
  template?: string;
  label?: string;
}

/**
 * Build the detector for a list's mapping entries. Same overlap priority as
 * plain cloak terms (58): specific built-ins — secrets, emails, URLs, paths,
 * GUIDs, IPs — sit higher, so a term inside a larger sensitive value loses to
 * the full value, exactly as the precedence rules require.
 */
export function createMappedTermsDetector(
  entries: readonly CloakMappingEntry[],
  sourceName = 'Cloak mapping',
  options: MappingDetectorOptions = {},
): Detector {
  const usable = usableMappings(entries);

  return {
    id: 'cloak-mapping',
    name: sourceName,
    category: 'organization',
    severity: 'medium',
    label: sanitizePlaceholderLabel(options.label, DEFAULT_CUSTOM_TERM_LABEL),
    placeholderTemplate:
      options.template && validateTemplate(options.template) === null
        ? options.template
        : DEFAULT_TEMPLATE,
    priority: 58,
    explanation: 'A term from one of your Cloak List mappings.',
    // Case variants share one placeholder except in exact-case mode — but
    // normalization is per-detector, so lowercase uniformly; exact-case
    // entries still match case-sensitively, they just share numbering.
    normalizeValue: (value) => value.toLocaleLowerCase(),
    detect: (text): RawMatch[] => {
      if (usable.length === 0) return [];
      const stringRanges = findPowerShellStringRanges(text);
      const matches: RawMatch[] = [];
      for (const entry of usable) {
        const source =
          entry.matchMode === 'word'
            ? `(?<![\\p{L}\\p{N}_])${escapeRegExp(entry.term)}(?![\\p{L}\\p{N}_])`
            : escapeRegExp(entry.term);
        const flags = entry.matchMode === 'literal' ? 'gu' : 'giu';
        const re = new RegExp(source, flags);
        let m: RegExpExecArray | null;
        while ((m = re.exec(text)) !== null) {
          const start = m.index;
          const end = start + m[0].length;
          let replacement: string | null = null;
          if (entry.replacement !== '') {
            if (entry.strategy === 'code-only') {
              replacement = codeSafeReplacementFor(text, start, end, entry.replacement, stringRanges);
            } else if (entry.strategy === 'genericize') {
              // Identifier positions still adapt casing; prose and string
              // literals get the replacement exactly as written.
              replacement =
                codeSafeReplacementFor(text, start, end, entry.replacement, stringRanges) ??
                entry.replacement;
            }
          }
          matches.push({
            start,
            end,
            value: m[0],
            confidence: 'high',
            category: categoryForLabel(entry.categoryLabel),
            severity: entry.severity,
            ...(replacement !== null ? { replacement } : {}),
            ...(entry.strategy === 'review-lead' ? { reviewLead: true } : {}),
          });
          if (m[0].length === 0) re.lastIndex += 1;
        }
      }
      return matches;
    },
  };
}
