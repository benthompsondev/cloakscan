import { detectors } from './detectors';
import { packById } from './packs';
import type { CustomPack } from './customPacks';
import { DEFAULT_TEMPLATE, type RedactionChoice } from './redaction';

/**
 * Profiles and resolution.
 *
 * Core modes:
 * - Balanced: every rule except strict-only and pack-only ones (the default).
 * - Strict: everything except pack-only rules.
 *
 * A profile combines a Core mode with packs, per-rule overrides, and a
 * redaction format. Resolution order (later stages win):
 *   Core mode -> built-in packs -> custom packs -> rule overrides
 *   -> custom labeled-field rules -> cloak terms
 * Packs only ENABLE rules; overrides are absolute booleans applied last.
 */

export type CoreMode = 'balanced' | 'strict';
export type ProfileId = CoreMode | 'custom'; // legacy alias, kept for v1 storage migration

export interface ProfileConfig {
  id: string;
  name: string;
  description?: string;
  core: CoreMode;
  /** Built-in pack ids (pack-ca-v1, ...). */
  packIds: string[];
  /** Custom pack ids owned by the workspace. */
  customPackIds: string[];
  /** Per-rule absolute overrides, applied after packs. */
  overrides: Record<string, boolean>;
  format: RedactionChoice;
  builtIn?: boolean;
}

export const BALANCED_PROFILE: ProfileConfig = Object.freeze<ProfileConfig>({
  id: 'balanced',
  name: 'Balanced',
  core: 'balanced',
  packIds: [],
  customPackIds: [],
  overrides: {},
  format: { id: 'indexed', customTemplate: DEFAULT_TEMPLATE },
  builtIn: true,
});

export const STRICT_PROFILE: ProfileConfig = Object.freeze<ProfileConfig>({
  id: 'strict',
  name: 'Strict',
  core: 'strict',
  packIds: [],
  customPackIds: [],
  overrides: {},
  format: { id: 'indexed', customTemplate: DEFAULT_TEMPLATE },
  builtIn: true,
});

export const BUILT_IN_PROFILES: readonly ProfileConfig[] = [BALANCED_PROFILE, STRICT_PROFILE];

/** Per-rule enabled map for a Core mode alone (no packs, no overrides). */
export function profileRuleStates(core: CoreMode): Record<string, boolean> {
  const states: Record<string, boolean> = {};
  for (const d of detectors) {
    states[d.id] = d.packOnly ? false : core === 'strict' ? true : !d.strictOnly;
  }
  return states;
}

/**
 * Resolve a profile to per-rule enabled states:
 * Core preset, then pack union (built-in + enabled custom packs), then
 * absolute overrides. A detector enabled by both Core and a pack is simply
 * enabled — the id set stays unique, so no duplicate findings are possible.
 */
export function resolveRuleStates(
  profile: ProfileConfig,
  customPacks: readonly CustomPack[] = [],
): Record<string, boolean> {
  const states = profileRuleStates(profile.core);
  for (const packId of profile.packIds) {
    for (const id of packById(packId)?.detectorIds ?? []) {
      if (id in states) states[id] = true;
    }
  }
  for (const packId of profile.customPackIds) {
    const pack = customPacks.find((p) => p.id === packId && p.enabled);
    for (const id of pack?.detectorIds ?? []) {
      if (id in states) states[id] = true;
    }
  }
  for (const [id, enabled] of Object.entries(profile.overrides)) {
    if (id in states) states[id] = enabled;
  }
  return states;
}

/** Detector ids that are enabled in a rule-state map. */
export function enabledRuleIds(states: Record<string, boolean>): string[] {
  return detectors.filter((d) => states[d.id]).map((d) => d.id);
}

/** Legacy shim used by v1 preference migration: derive core/custom from raw states. */
export function profileForStates(states: Record<string, boolean>): ProfileId {
  const matches = (core: CoreMode) => {
    const preset = profileRuleStates(core);
    return detectors.every((d) => (states[d.id] ?? false) === preset[d.id]);
  };
  if (matches('balanced')) return 'balanced';
  if (matches('strict')) return 'strict';
  return 'custom';
}

/** Two configs are equivalent when everything that affects scanning matches. */
export function sameConfig(a: ProfileConfig, b: ProfileConfig): boolean {
  return (
    a.core === b.core &&
    JSON.stringify([...a.packIds].sort()) === JSON.stringify([...b.packIds].sort()) &&
    JSON.stringify([...a.customPackIds].sort()) === JSON.stringify([...b.customPackIds].sort()) &&
    JSON.stringify(a.overrides) === JSON.stringify(b.overrides) &&
    a.format.id === b.format.id &&
    a.format.customTemplate === b.format.customTemplate
  );
}

let profileCounter = 0;

/** Stable-enough generated id: timestamp + counter, no dependency needed. */
export function generateId(prefix: string): string {
  profileCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${profileCounter.toString(36)}`;
}

export const MAX_NAME_LENGTH = 40;
export const MAX_PROFILES = 20;

/** Validate a profile or pack name. Returns an error message or null. */
export function validateName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) return 'Name cannot be empty.';
  if (trimmed.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer.`;
  return null;
}
