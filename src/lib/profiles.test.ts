import { describe, expect, it } from 'vitest';
import { detectors } from './detectors';
import {
  BALANCED_PROFILE,
  BUILT_IN_PROFILES,
  CODE_SECRETS_PROFILE,
  MAXIMUM_PROFILE,
  STRICT_PROFILE,
  enabledRuleIds,
  profileForStates,
  profileRuleStates,
  resolveRuleStates,
  sameConfig,
  type ProfileConfig,
} from './profiles';
import { BUILT_IN_PACKS } from './packs';
import { scanText } from './scan';
import { DEMO_TEXT } from './demo';

describe('profiles', () => {
  it('balanced enables every rule except strict-only and pack-only ones', () => {
    const states = profileRuleStates('balanced');
    for (const d of detectors) {
      expect(states[d.id], d.id).toBe(!d.strictOnly && !d.packOnly);
    }
  });

  it('strict enables everything except pack-only rules', () => {
    const states = profileRuleStates('strict');
    for (const d of detectors) {
      expect(states[d.id], d.id).toBe(!d.packOnly);
    }
  });

  it('derives the profile from rule states, including custom', () => {
    expect(profileForStates(profileRuleStates('balanced'))).toBe('balanced');
    expect(profileForStates(profileRuleStates('strict'))).toBe('strict');
    const custom = { ...profileRuleStates('balanced'), email: false };
    expect(profileForStates(custom)).toBe('custom');
  });

  it('Maximum enables every registered detector through Strict plus all packs', () => {
    expect(MAXIMUM_PROFILE.core).toBe('strict');
    expect(MAXIMUM_PROFILE.packIds).toEqual(BUILT_IN_PACKS.map((pack) => pack.id));
    const states = resolveRuleStates(MAXIMUM_PROFILE);
    expect(detectors.every((detector) => states[detector.id])).toBe(true);
  });

  it('Code & secrets keeps code-shaped rules on and prose PII off', () => {
    const states = resolveRuleStates(CODE_SECRETS_PROFILE);
    for (const detector of detectors) {
      if (detector.category === 'personal') {
        expect(states[detector.id], detector.id).toBe(false);
      } else if (!detector.packOnly) {
        expect(states[detector.id], detector.id).toBe(true);
      }
    }
  });

  it('deep-freezes every built-in profile and its mutable-looking fields', () => {
    for (const profile of BUILT_IN_PROFILES) {
      expect(Object.isFrozen(profile)).toBe(true);
      expect(Object.isFrozen(profile.packIds)).toBe(true);
      expect(Object.isFrozen(profile.customPackIds)).toBe(true);
      expect(Object.isFrozen(profile.overrides)).toBe(true);
      expect(Object.isFrozen(profile.format)).toBe(true);
    }
  });
});

describe('scan engine configuration', () => {
  it('balanced default preserves existing behavior exactly', () => {
    const implicit = scanText(DEMO_TEXT);
    const explicit = scanText(DEMO_TEXT, {
      enabledDetectorIds: enabledRuleIds(profileRuleStates('balanced')),
    });
    expect(implicit).toEqual(explicit);
    // Strict-only rules never fire in the default configuration.
    expect(implicit.some((f) => f.detectorId === 'person-name')).toBe(false);
    expect(implicit.some((f) => f.detectorId === 'org-name')).toBe(false);
  });

  it('disabled rules generate no findings', () => {
    const text = 'mail a@example.internal from 10.0.0.5';
    const withoutEmail = scanText(text, {
      enabledDetectorIds: enabledRuleIds({ ...profileRuleStates('balanced'), email: false }),
    });
    expect(withoutEmail.some((f) => f.detectorId === 'email')).toBe(false);
    expect(withoutEmail.some((f) => f.detectorId === 'ipv4')).toBe(true);
  });

  it('strict profile adds labeled person and organization names on the demo', () => {
    const strict = scanText(DEMO_TEXT, {
      enabledDetectorIds: enabledRuleIds(profileRuleStates('strict')),
    });
    expect(strict.some((f) => f.detectorId === 'person-name')).toBe(true);
    expect(strict.some((f) => f.detectorId === 'org-name')).toBe(true);
  });

  it('does not mutate detector definitions when configured', () => {
    const before = detectors.map((d) => d.id).join(',');
    scanText(DEMO_TEXT, { enabledDetectorIds: ['email'] });
    expect(detectors.map((d) => d.id).join(',')).toBe(before);
  });
});

describe('profile editor save semantics', () => {
  const saved = (): ProfileConfig => ({
    id: 'profile-support',
    name: 'Support profile',
    description: 'Synthetic demo profile',
    core: 'balanced',
    packIds: ['pack-ca-v1'],
    customPackIds: [],
    overrides: { email: false },
    format: { id: 'indexed', customTemplate: '[{TYPE}_{INDEX}]' },
  });

  it('rename and description edits do NOT count as scanning changes', () => {
    const a = saved();
    expect(sameConfig(a, { ...a, name: 'Sharing profile', description: 'Renamed' })).toBe(true);
  });

  it('mode, pack, Cloak List, override, and format edits DO count as scanning changes', () => {
    const a = saved();
    expect(sameConfig(a, { ...a, core: 'strict' })).toBe(false);
    expect(sameConfig(a, { ...a, packIds: [] })).toBe(false);
    expect(sameConfig(a, { ...a, customPackIds: ['pack-x'] })).toBe(false);
    expect(sameConfig(a, { ...a, overrides: {} })).toBe(false);
    expect(
      sameConfig(a, { ...a, format: { id: 'uniform', customTemplate: '[{TYPE}_{INDEX}]' } }),
    ).toBe(false);
  });

  it('built-in presets are frozen — the editor path can never mutate them', () => {
    expect(Object.isFrozen(BALANCED_PROFILE)).toBe(true);
    expect(Object.isFrozen(STRICT_PROFILE)).toBe(true);
    expect(() => {
      (BALANCED_PROFILE as { name: string }).name = 'mutated';
    }).toThrow();
  });
});
