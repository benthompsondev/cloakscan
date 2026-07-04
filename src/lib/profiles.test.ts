import { describe, expect, it } from 'vitest';
import { detectors } from './detectors';
import { enabledRuleIds, profileForStates, profileRuleStates } from './profiles';
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
