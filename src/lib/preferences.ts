import { detectors } from './detectors';
import { BUILT_IN_PACKS } from './packs';
import {
  profileForStates,
  profileRuleStates,
  validateName,
  type CoreMode,
  type ProfileConfig,
} from './profiles';
import {
  MAX_CUSTOM_PACKS,
  MAX_LABELS_PER_RULE,
  MAX_RULES_PER_PACK,
  MAX_TERMS_PER_PACK,
  MAX_TERM_LENGTH,
  PLACEHOLDER_LABEL_RE,
  emptyPackTerms,
  validateCustomRule,
  type CustomFieldRule,
  type CustomPack,
} from './customPacks';
import { MAX_PROFILES } from './profiles';
import { validateTemplate, DEFAULT_TEMPLATE, type RedactionChoice, type RedactionFormatId } from './redaction';
import type { Category, Severity } from './types';

/**
 * Opt-in preference persistence, schema v2. OFF by default: CloakGuard writes
 * nothing to browser storage unless "Remember preferences on this device" is
 * enabled.
 *
 * v2 key: cloakguard.prefs.v2
 *   { version: 2, activeProfileId, profiles[], customPacks[] }
 *
 * The legacy v1 key (profile/ruleStates/format) is migrated to v2 on load and
 * then deleted. Loading is allowlist-only: unknown fields, malformed rules,
 * oversized arrays, invalid placeholders, and unknown detector/pack ids are
 * discarded.
 *
 * Private-term VALUES are persisted only for packs whose separate
 * "save these sensitive terms" opt-in is set. Saved values are plain,
 * unencrypted localStorage data — the UI must say so.
 *
 * NEVER stored, under any setting: source text, imported file contents or
 * filenames, findings, matched values, masked previews, sanitized output,
 * clipboard content, or scan history.
 */

export const PREFERENCES_STORAGE_KEY = 'cloakguard.prefs.v1'; // legacy
export const PREFERENCES_STORAGE_KEY_V2 = 'cloakguard.prefs.v2';

export interface PreferencesV2 {
  version: 2;
  activeProfileId: string;
  profiles: ProfileConfig[];
  customPacks: CustomPack[];
}

export function defaultPreferencesV2(): PreferencesV2 {
  return { version: 2, activeProfileId: 'balanced', profiles: [], customPacks: [] };
}

// ------------------------------------------------------------- sanitizers ---

const REGISTRY_IDS = new Set(detectors.map((d) => d.id));
const BUILT_IN_PACK_IDS = new Set(BUILT_IN_PACKS.map((p) => p.id));
const FORMAT_IDS: RedactionFormatId[] = ['indexed', 'unnumbered', 'uniform', 'custom'];
const CATEGORIES: Category[] = ['secrets', 'infrastructure', 'personal', 'paths'];
const SEVERITIES: Severity[] = ['high', 'medium', 'low'];

function cleanString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) return null;
  return trimmed;
}

function cleanFormat(raw: unknown): RedactionChoice {
  const fallback: RedactionChoice = { id: 'indexed', customTemplate: DEFAULT_TEMPLATE };
  if (typeof raw !== 'object' || raw === null) return fallback;
  const data = raw as Record<string, unknown>;
  const id = FORMAT_IDS.includes(data.id as RedactionFormatId)
    ? (data.id as RedactionFormatId)
    : 'indexed';
  const customTemplate =
    typeof data.customTemplate === 'string' && validateTemplate(data.customTemplate) === null
      ? data.customTemplate
      : DEFAULT_TEMPLATE;
  return { id, customTemplate };
}

function cleanOverrides(raw: unknown): Record<string, boolean> {
  const overrides: Record<string, boolean> = {};
  if (typeof raw !== 'object' || raw === null) return overrides;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (REGISTRY_IDS.has(key) && typeof value === 'boolean') overrides[key] = value;
  }
  return overrides;
}

function cleanIdList(raw: unknown, allowed: (id: string) => boolean, max: number): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item === 'string' && allowed(item) && !out.includes(item)) out.push(item);
    if (out.length >= max) break;
  }
  return out;
}

function cleanCustomRule(raw: unknown): CustomFieldRule | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const id = cleanString(data.id, 60);
  const name = cleanString(data.name, 40);
  if (!id || !name) return null;
  const labels = Array.isArray(data.labels)
    ? data.labels
        .filter((l): l is string => typeof l === 'string')
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && l.length <= 40 && !/[\r\n]/.test(l))
        .slice(0, MAX_LABELS_PER_RULE)
    : [];
  const valueType =
    data.valueType === 'digits' || data.valueType === 'identifier' || data.valueType === 'text'
      ? data.valueType
      : null;
  const placeholderLabel =
    typeof data.placeholderLabel === 'string' && PLACEHOLDER_LABEL_RE.test(data.placeholderLabel)
      ? data.placeholderLabel
      : null;
  const category = CATEGORIES.includes(data.category as Category)
    ? (data.category as Category)
    : 'personal';
  const severity = SEVERITIES.includes(data.severity as Severity)
    ? (data.severity as Severity)
    : 'medium';
  const maxLength =
    typeof data.maxLength === 'number' && Number.isInteger(data.maxLength) ? data.maxLength : 40;
  if (!valueType || !placeholderLabel || labels.length === 0) return null;
  const rule: CustomFieldRule = {
    id,
    name,
    labels,
    valueType,
    placeholderLabel,
    category,
    severity,
    maxLength,
    enabled: data.enabled !== false,
  };
  return validateCustomRule(rule) === null ? rule : null;
}

function cleanCustomPack(raw: unknown): CustomPack | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const id = cleanString(data.id, 60);
  const name = cleanString(data.name, 40);
  if (!id || !name || validateName(name) !== null) return null;
  const description = cleanString(data.description, 200) ?? undefined;
  const detectorIds = cleanIdList(data.detectorIds, (x) => REGISTRY_IDS.has(x), 64);
  const rules = Array.isArray(data.rules)
    ? data.rules.map(cleanCustomRule).filter((r): r is CustomFieldRule => r !== null).slice(0, MAX_RULES_PER_PACK)
    : [];
  const terms = emptyPackTerms();
  if (typeof data.terms === 'object' && data.terms !== null) {
    const t = data.terms as Record<string, unknown>;
    terms.caseSensitive = t.caseSensitive === true;
    terms.matchInsideWords = t.matchInsideWords !== false;
    terms.saveTerms = t.saveTerms === true;
    if (terms.saveTerms && Array.isArray(t.values)) {
      terms.values = t.values
        .filter((v): v is string => typeof v === 'string')
        .map((v) => v.trim())
        .filter((v) => v.length >= 2 && v.length <= MAX_TERM_LENGTH)
        .slice(0, MAX_TERMS_PER_PACK);
    }
  }
  return { id, name, description, detectorIds, rules, terms, enabled: data.enabled !== false };
}

function cleanProfile(raw: unknown, customPackIds: Set<string>): ProfileConfig | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  const id = cleanString(data.id, 60);
  const name = cleanString(data.name, 40);
  if (!id || !name || id === 'balanced' || id === 'strict' || validateName(name) !== null) {
    return null;
  }
  const core: CoreMode = data.core === 'strict' ? 'strict' : 'balanced';
  return {
    id,
    name,
    description: cleanString(data.description, 200) ?? undefined,
    core,
    packIds: cleanIdList(data.packIds, (x) => BUILT_IN_PACK_IDS.has(x), BUILT_IN_PACKS.length),
    customPackIds: cleanIdList(data.customPackIds, (x) => customPackIds.has(x), MAX_CUSTOM_PACKS),
    overrides: cleanOverrides(data.overrides),
    format: cleanFormat(data.format),
  };
}

/** Rebuild a PreferencesV2 from untrusted stored data, allowlist-only. */
export function sanitizeV2(raw: unknown): PreferencesV2 | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 2) return null;

  const customPacks = Array.isArray(data.customPacks)
    ? data.customPacks.map(cleanCustomPack).filter((p): p is CustomPack => p !== null).slice(0, MAX_CUSTOM_PACKS)
    : [];
  const packIdSet = new Set(customPacks.map((p) => p.id));
  const profiles = Array.isArray(data.profiles)
    ? data.profiles
        .map((p) => cleanProfile(p, packIdSet))
        .filter((p): p is ProfileConfig => p !== null)
        .slice(0, MAX_PROFILES)
    : [];

  const requested = typeof data.activeProfileId === 'string' ? data.activeProfileId : 'balanced';
  const activeProfileId =
    requested === 'balanced' || requested === 'strict' || profiles.some((p) => p.id === requested)
      ? requested
      : 'balanced';

  return { version: 2, activeProfileId, profiles, customPacks };
}

// -------------------------------------------------------------- migration ---

/** Convert a valid v1 object into v2. Custom v1 states become a named profile. */
export function migrateV1(raw: unknown): PreferencesV2 | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const data = raw as Record<string, unknown>;
  if (data.version !== 1) return null;

  const ruleStates: Record<string, boolean> = {};
  if (typeof data.ruleStates === 'object' && data.ruleStates !== null) {
    for (const [key, value] of Object.entries(data.ruleStates as Record<string, unknown>)) {
      if (REGISTRY_IDS.has(key) && typeof value === 'boolean') ruleStates[key] = value;
    }
  }
  const merged = { ...profileRuleStates('balanced'), ...ruleStates };
  const derived = profileForStates(merged);
  const format = cleanFormat(data.format);
  const isDefaultFormat = format.id === 'indexed';

  if ((derived === 'balanced' || derived === 'strict') && isDefaultFormat) {
    return { version: 2, activeProfileId: derived, profiles: [], customPacks: [] };
  }

  // Anything custom becomes a real named profile so nothing is silently lost.
  const core: CoreMode = derived === 'strict' ? 'strict' : 'balanced';
  const preset = profileRuleStates(core);
  const overrides: Record<string, boolean> = {};
  for (const d of detectors) {
    if ((merged[d.id] ?? false) !== preset[d.id]) overrides[d.id] = merged[d.id] ?? false;
  }
  const migrated: ProfileConfig = {
    id: 'migrated-v1',
    name: 'Migrated settings',
    description: 'Created automatically from your previous preferences.',
    core,
    packIds: [],
    customPackIds: [],
    overrides,
    format,
  };
  return { version: 2, activeProfileId: migrated.id, profiles: [migrated], customPacks: [] };
}

// ----------------------------------------------------------------- storage ---

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Load stored preferences (migrating v1 if present), or null when nothing valid exists. */
export function loadPreferencesV2(): PreferencesV2 | null {
  const store = storage();
  if (!store) return null;
  try {
    const rawV2 = store.getItem(PREFERENCES_STORAGE_KEY_V2);
    if (rawV2 !== null) return sanitizeV2(JSON.parse(rawV2));
    const rawV1 = store.getItem(PREFERENCES_STORAGE_KEY);
    if (rawV1 !== null) {
      const migrated = migrateV1(JSON.parse(rawV1));
      if (migrated) {
        // The presence of a v1 key means the user had opted in; carry forward.
        savePreferencesV2(migrated);
        store.removeItem(PREFERENCES_STORAGE_KEY);
        return migrated;
      }
      store.removeItem(PREFERENCES_STORAGE_KEY);
    }
    return null;
  } catch {
    return null;
  }
}

/** Persist the allowlisted v2 fields — nothing else, ever. */
export function savePreferencesV2(prefs: PreferencesV2): void {
  const store = storage();
  if (!store) return;
  const allowlisted: PreferencesV2 = {
    version: 2,
    activeProfileId: prefs.activeProfileId,
    profiles: prefs.profiles.slice(0, MAX_PROFILES).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      core: p.core,
      packIds: [...p.packIds],
      customPackIds: [...p.customPackIds],
      overrides: { ...p.overrides },
      format: { id: p.format.id, customTemplate: p.format.customTemplate },
    })),
    customPacks: prefs.customPacks.slice(0, MAX_CUSTOM_PACKS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      detectorIds: [...p.detectorIds],
      rules: p.rules.slice(0, MAX_RULES_PER_PACK).map((r) => ({ ...r, labels: [...r.labels] })),
      terms: {
        caseSensitive: p.terms.caseSensitive,
        matchInsideWords: p.terms.matchInsideWords,
        saveTerms: p.terms.saveTerms,
        // Term VALUES only persist behind the pack's separate explicit opt-in.
        values: p.terms.saveTerms ? p.terms.values.slice(0, MAX_TERMS_PER_PACK) : [],
      },
      enabled: p.enabled,
    })),
  };
  try {
    store.setItem(PREFERENCES_STORAGE_KEY_V2, JSON.stringify(allowlisted));
  } catch {
    // Quota/policy errors: preferences simply stay session-only.
  }
}

/** Delete every CloakGuard key: v1, v2, and everything inside them. */
export function clearPreferences(): void {
  try {
    storage()?.removeItem(PREFERENCES_STORAGE_KEY);
    storage()?.removeItem(PREFERENCES_STORAGE_KEY_V2);
  } catch {
    // nothing to do
  }
}

/** Whether any CloakGuard preferences key exists on this device. */
export function hasStoredPreferences(): boolean {
  try {
    const store = storage();
    if (!store) return false;
    return (
      store.getItem(PREFERENCES_STORAGE_KEY_V2) !== null ||
      store.getItem(PREFERENCES_STORAGE_KEY) !== null
    );
  } catch {
    return false;
  }
}
