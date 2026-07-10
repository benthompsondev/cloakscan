import { MAX_TERMS_PER_PACK, MAX_TERM_LENGTH, type CustomPack, emptyPackTerms } from './customPacks';
import {
  MAX_MAPPINGS_PER_LIST,
  cleanMappingEntry,
  type CloakMappingEntry,
} from './cloakMappings';
import { generateId, validateName } from './profiles';
import {
  DEFAULT_CUSTOM_TERM_LABEL,
  sanitizePlaceholderLabel,
  validateTemplate,
  type RedactionChoice,
} from './redaction';

/**
 * Cloak List JSON files: a portable, local file format so a list can move to
 * another device. The file contains ONLY user-defined rules — the list name,
 * description, matching options, terms, and mapping entries. Source text,
 * findings, matched scan values, filenames, clipboard content, and sanitized
 * output are never part of the CustomPack model, and serialization is
 * field-by-field, so they cannot leak into an export.
 *
 * The terms and mappings in a list are themselves organization-specific data
 * — the UI must warn before exporting.
 */

export const CLOAK_LIST_FILE_KIND = 'cloakscan.cloak-list';
export const CLOAK_LIST_FILE_VERSION = 1;

interface CloakListFile {
  kind: typeof CLOAK_LIST_FILE_KIND;
  version: typeof CLOAK_LIST_FILE_VERSION;
  name: string;
  description?: string;
  caseSensitive: boolean;
  matchInsideWords: boolean;
  termLabel?: string;
  termFormat?: RedactionChoice;
  terms: string[];
  mappings: CloakMappingEntry[];
}

/** Serialize a Cloak List for export. Field-by-field allowlist — never spread. */
export function serializeCloakList(pack: CustomPack): string {
  const file: CloakListFile = {
    kind: CLOAK_LIST_FILE_KIND,
    version: CLOAK_LIST_FILE_VERSION,
    name: pack.name,
    ...(pack.description ? { description: pack.description } : {}),
    caseSensitive: pack.terms.caseSensitive,
    matchInsideWords: pack.terms.matchInsideWords,
    ...(pack.terms.termLabel ? { termLabel: pack.terms.termLabel } : {}),
    ...(pack.terms.termFormat ? { termFormat: pack.terms.termFormat } : {}),
    terms: [...pack.terms.values],
    mappings: (pack.terms.mappings ?? []).map((m) => ({
      id: m.id,
      term: m.term,
      replacement: m.replacement,
      categoryLabel: m.categoryLabel,
      severity: m.severity,
      matchMode: m.matchMode,
      codeSafe: m.codeSafe,
    })),
  };
  return `${JSON.stringify(file, null, 2)}\n`;
}

export type CloakListParseResult =
  | { ok: true; pack: CustomPack }
  | { ok: false; error: string };

function fail(error: string): CloakListParseResult {
  return { ok: false, error };
}

/**
 * Parse an imported Cloak List file. Malformed input fails safely with a
 * user-facing error; anything recovered goes through the same allowlists as
 * stored preferences. The imported list always starts session-only
 * (saveTerms off) — persisting it stays an explicit opt-in on this device.
 */
export function parseCloakListFile(text: string): CloakListParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail('Not a valid JSON file.');
  }
  if (typeof raw !== 'object' || raw === null) return fail('Not a Cloak List file.');
  const data = raw as Record<string, unknown>;
  if (data.kind !== CLOAK_LIST_FILE_KIND) {
    return fail('Not a Cloak List file (missing the cloakscan.cloak-list marker).');
  }
  if (data.version !== CLOAK_LIST_FILE_VERSION) {
    return fail('This Cloak List file version is not supported by this build.');
  }
  const name = typeof data.name === 'string' ? data.name.trim().slice(0, 40) : '';
  if (name.length === 0 || validateName(name) !== null) {
    return fail('The file has no usable list name.');
  }

  const terms = Array.isArray(data.terms)
    ? data.terms
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length >= 2 && v.length <= MAX_TERM_LENGTH)
        .slice(0, MAX_TERMS_PER_PACK)
    : [];
  const mappings = Array.isArray(data.mappings)
    ? data.mappings
        .map((m, index) => cleanMappingEntry(m, generateId(`map-${index}`)))
        .filter((m): m is CloakMappingEntry => m !== null)
        .slice(0, MAX_MAPPINGS_PER_LIST)
    : [];
  if (terms.length === 0 && mappings.length === 0) {
    return fail('The file contains no usable terms or mappings.');
  }

  const packTerms = emptyPackTerms();
  packTerms.caseSensitive = data.caseSensitive === true;
  packTerms.matchInsideWords = data.matchInsideWords === true;
  packTerms.values = terms;
  if (mappings.length > 0) packTerms.mappings = mappings;
  if (typeof data.termLabel === 'string') {
    packTerms.termLabel = sanitizePlaceholderLabel(data.termLabel, DEFAULT_CUSTOM_TERM_LABEL);
  }
  if (typeof data.termFormat === 'object' && data.termFormat !== null) {
    const format = data.termFormat as Record<string, unknown>;
    if (
      (format.id === 'indexed' || format.id === 'unnumbered' || format.id === 'uniform' ||
        format.id === 'custom') &&
      typeof format.customTemplate === 'string' &&
      validateTemplate(format.customTemplate) === null
    ) {
      packTerms.termFormat = { id: format.id, customTemplate: format.customTemplate };
    }
  }

  return {
    ok: true,
    pack: {
      id: generateId('pack'),
      name,
      description:
        typeof data.description === 'string' ? data.description.trim().slice(0, 200) : undefined,
      detectorIds: [],
      rules: [],
      terms: packTerms,
      enabled: true,
    },
  };
}
