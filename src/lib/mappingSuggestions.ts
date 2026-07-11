import type { CloakMappingEntry } from './cloakMappings';
import { REPLACEMENT_IDENTIFIER_RE } from './codeSafe';

/**
 * Smart mapping suggestions: turn a reviewed candidate term into a starting
 * mapping — a generic replacement identifier plus a category guess — so
 * building a portfolio Cloak List is mostly accepting defaults instead of
 * inventing names. Pure heuristics on the term's shape; suggestions are
 * always editable in the Cloak List editor before anything is saved.
 */

export interface MappingSuggestion {
  term: string;
  replacement: string;
  categoryLabel: string;
}

interface ShapeRule {
  test: (term: string, lower: string) => boolean;
  replacement: string;
  categoryLabel: string;
}

// Order matters: first matching shape wins.
const SHAPE_RULES: ShapeRule[] = [
  {
    // APP-Portal-Users / GRP-Something / SG- / DL- style directory groups
    test: (term) => /^(?:APP|GRP|SG|DL|ACL)-/i.test(term) || /-(?:Users|Admins|Members)$/i.test(term),
    replacement: 'App-Access-Group',
    categoryLabel: 'Access Group',
  },
  {
    test: (term) => /^LIC-/i.test(term) || /licen[cs]e/i.test(term),
    replacement: 'ProviderLicenseId',
    categoryLabel: 'License Group',
  },
  {
    test: (_term, lower) =>
      /(?:ticket|helpdesk|servicedesk|itsm)/.test(lower),
    replacement: 'TicketingSystem',
    categoryLabel: 'Ticketing System',
  },
  {
    test: (term) => /(?:ID|Id)$/.test(term),
    replacement: 'SourceSystemID',
    categoryLabel: 'Code Identifier',
  },
  {
    test: (_term, lower) => /(?:portal|console|dashboard|intranet)/.test(lower),
    replacement: 'InternalApp',
    categoryLabel: 'Internal Application',
  },
  {
    test: (term) => /\.(?:ps1|psm1|csv|json|xml|log|txt)$/i.test(term),
    replacement: 'InternalFile',
    categoryLabel: 'Internal File Name',
  },
  {
    // Short all-caps acronyms usually name an internal system.
    test: (term) => /^[A-Z]{2,6}$/.test(term),
    replacement: 'SourceSystem',
    categoryLabel: 'Organization',
  },
  {
    // 'Project Nightjar' style code names.
    test: (_term, lower) => /^project\s/.test(lower) || /\sproject$/.test(lower),
    replacement: 'ProjectName',
    categoryLabel: 'Project',
  },
  {
    // Street-suffix phrases are usually addresses, not organizations.
    test: (_term, lower) =>
      /\s(?:street|avenue|ave|road|rd|drive|dr|boulevard|blvd|lane|ln|court|ct|crescent|way)\.?$/.test(
        lower,
      ),
    replacement: 'SourceAddress',
    categoryLabel: 'Address',
  },
  {
    // Multi-word phrases with an organization cue word (Health, Group,
    // Hospital, Services...). These generic nouns are shape hints, not a
    // company dictionary.
    test: (_term, lower) => /\s/.test(lower.trim()) && ORG_CUE_RE.test(lower),
    replacement: 'SourceOrg',
    categoryLabel: 'Organization',
  },
  {
    // Any other multi-word title phrase could just as easily be a person,
    // place, or product — don't pretend to know. The neutral label makes it
    // obvious this row needs a human decision.
    test: (term) => /\s/.test(term.trim()),
    replacement: 'ReviewTerm',
    categoryLabel: 'Unclassified — edit before saving',
  },
];

// Generic organization nouns that make an org reading likely. Cue words only —
// never real company or person names.
const ORG_CUE_RE =
  /\b(?:health|healthcare|hospital|clinic|medical|care|group|systems?|solutions|services|technologies|software|consulting|partners|holdings|industries|enterprises|logistics|foundation|institute|university|college|academy|agency|council|authority|association|regional|centre|center|networks?|labs?|corp|corporation|inc|ltd|llc|company)\b/;

const DEFAULT_RULE = { replacement: 'SourceSystem', categoryLabel: 'Organization' };

/** Suggest a replacement identifier and category for one term. */
export function suggestMapping(term: string): MappingSuggestion {
  const trimmed = term.trim();
  const lower = trimmed.toLocaleLowerCase();
  const rule = SHAPE_RULES.find((r) => r.test(trimmed, lower)) ?? DEFAULT_RULE;
  // The ID suffix mirrors the term's own casing (ID vs Id).
  const replacement =
    rule.replacement === 'SourceSystemID' && /Id$/.test(trimmed)
      ? 'SourceSystemId'
      : rule.replacement;
  return { term: trimmed, replacement, categoryLabel: rule.categoryLabel };
}

/**
 * Suggestions for a batch of terms, with duplicate replacements numbered
 * (SourceSystem, SourceSystem2, ...) so two different real terms never end up
 * looking like the same generic system in the sanitized code.
 */
export function suggestMappings(terms: readonly string[]): MappingSuggestion[] {
  const used = new Map<string, number>();
  return terms.map((term) => {
    const suggestion = suggestMapping(term);
    const count = (used.get(suggestion.replacement) ?? 0) + 1;
    used.set(suggestion.replacement, count);
    if (count === 1) return suggestion;
    // 'SourceSystemID2' reads badly — number before the ID suffix.
    const numbered = /(?:ID|Id)$/.test(suggestion.replacement)
      ? suggestion.replacement.replace(/(ID|Id)$/, `${count}$1`)
      : `${suggestion.replacement}${count}`;
    return { ...suggestion, replacement: numbered };
  });
}

/** Build ready-to-edit mapping entries for the Cloak List editor. */
export function suggestionsToMappings(
  suggestions: readonly MappingSuggestion[],
  generateId: (prefix: string) => string,
): CloakMappingEntry[] {
  return suggestions
    .filter((s) => REPLACEMENT_IDENTIFIER_RE.test(s.replacement))
    .map((s) => ({
      id: generateId('map'),
      term: s.term,
      replacement: s.replacement,
      categoryLabel: s.categoryLabel,
      severity: 'medium' as const,
      matchMode: 'ci-literal' as const,
      codeSafe: true,
      strategy: 'code-only' as const,
    }));
}
