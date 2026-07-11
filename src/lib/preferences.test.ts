import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_STORAGE_KEY_V2,
  clearPreferences,
  defaultPreferencesV2,
  hasStoredPreferences,
  loadPreferencesV2,
  migrateV1,
  sanitizeV2,
  savePreferencesV2,
} from './preferences';
import { emptyPackTerms, type CustomPack } from './customPacks';
import { BALANCED_PROFILE, profileRuleStates, type ProfileConfig } from './profiles';

function fakeStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (k: string) => map.get(k) ?? null,
    key: (i: number) => [...map.keys()][i] ?? null,
    removeItem: (k: string) => void map.delete(k),
    setItem: (k: string, v: string) => void map.set(k, v),
  };
}

const namedProfile = (over: Partial<ProfileConfig> = {}): ProfileConfig => ({
  ...BALANCED_PROFILE,
  id: 'p-demo',
  name: 'Ops profile',
  builtIn: undefined,
  packIds: ['pack-ca-v1'],
  customPackIds: [],
  overrides: { email: false },
  ...over,
});

const customPack = (over: Partial<CustomPack> = {}): CustomPack => ({
  id: 'cp-demo',
  name: 'Team pack',
  detectorIds: ['us-ssn'],
  rules: [
    {
      id: 'r1',
      name: 'Badge',
      labels: ['BadgeId'],
      valueType: 'digits',
      placeholderLabel: 'BADGE_ID',
      category: 'personal',
      severity: 'medium',
      maxLength: 20,
      enabled: true,
    },
  ],
  terms: { ...emptyPackTerms(), values: ['contoso'], caseSensitive: false, matchInsideWords: true },
  enabled: true,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal('localStorage', fakeStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('profile description persistence', () => {
  it('round-trips a profile description within the 200-character cap', () => {
    const description = 'Synthetic profile for sharing sanitized logs outside the team.';
    savePreferencesV2({
      version: 2,
      activeProfileId: 'p-demo',
      profiles: [namedProfile({ description })],
      customPacks: [],
    });
    const loaded = loadPreferencesV2();
    expect(loaded?.profiles[0]?.description).toBe(description);
  });

  it('drops an over-200-character description on load instead of truncating silently wrong data', () => {
    const raw = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY_V2) ?? 'null');
    savePreferencesV2({
      version: 2,
      activeProfileId: 'p-demo',
      profiles: [namedProfile()],
      customPacks: [],
    });
    const stored = JSON.parse(localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)!);
    stored.profiles[0].description = 'x'.repeat(201);
    const cleaned = sanitizeV2(stored);
    expect(cleaned?.profiles[0]?.description).toBeUndefined();
    expect(raw).toBeNull(); // sanity: this test started from an empty store
  });
});

describe('v2 persistence', () => {
  it('round-trips profiles and custom packs under one v2 key', () => {
    savePreferencesV2({
      version: 2,
      activeProfileId: 'p-demo',
      profiles: [namedProfile()],
      customPacks: [customPack({ terms: { ...emptyPackTerms(), saveTerms: true, values: ['contoso'] } })],
    });
    expect(Object.keys({ ...localStorage }).length).toBeGreaterThanOrEqual(0);
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)).not.toBeNull();
    const loaded = loadPreferencesV2()!;
    expect(loaded.activeProfileId).toBe('p-demo');
    expect(loaded.profiles[0].packIds).toEqual(['pack-ca-v1']);
    expect(loaded.profiles[0].overrides).toEqual({ email: false });
    expect(loaded.customPacks[0].rules).toHaveLength(1);
    expect(loaded.customPacks[0].terms.values).toEqual(['contoso']);
  });

  it('round-trips an optional Cloak List format and sanitized label', () => {
    savePreferencesV2({
      version: 2,
      activeProfileId: 'balanced',
      profiles: [],
      customPacks: [
        customPack({
          terms: {
            ...emptyPackTerms(),
            termFormat: { id: 'custom', customTemplate: '<{TYPE}:{INDEX}>' },
            termLabel: 'client',
          },
        }),
      ],
    });
    const terms = loadPreferencesV2()!.customPacks[0].terms;
    expect(terms.termFormat).toEqual({
      id: 'custom',
      customTemplate: '<{TYPE}:{INDEX}>',
    });
    expect(terms.termLabel).toBe('CLIENT');
  });

  it('falls back safely for invalid stored Cloak List format fields', () => {
    const pack = customPack();
    const cleaned = sanitizeV2({
      version: 2,
      activeProfileId: 'balanced',
      profiles: [],
      customPacks: [
        {
          ...pack,
          terms: {
            ...pack.terms,
            termFormat: { id: 'custom', customTemplate: '{MATCHED_VALUE}' },
            termLabel: 'not valid!',
          },
        },
      ],
    })!;
    expect(cleaned.customPacks[0].terms.termFormat).toEqual({
      id: 'indexed',
      customTemplate: '[{TYPE}_{INDEX}]',
    });
    expect(cleaned.customPacks[0].terms.termLabel).toBe('CUSTOM_TERM');
  });

  it('never persists term values without the explicit per-pack opt-in', () => {
    savePreferencesV2({
      version: 2,
      activeProfileId: 'balanced',
      profiles: [],
      customPacks: [customPack()], // saveTerms is false
    });
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)!;
    expect(raw).not.toContain('contoso');
    expect(loadPreferencesV2()!.customPacks[0].terms.values).toEqual([]);
  });

  it('never persists mapping terms without the explicit per-pack opt-in', () => {
    const mapping = {
      id: 'map-1',
      term: 'NirvInternal',
      replacement: 'SourceSystem',
      categoryLabel: 'Organization',
      severity: 'medium' as const,
      matchMode: 'ci-literal' as const,
      codeSafe: true,
      strategy: 'code-only' as const,
    };
    savePreferencesV2({
      version: 2,
      activeProfileId: 'balanced',
      profiles: [],
      customPacks: [
        customPack({ terms: { ...emptyPackTerms(), mappings: [mapping] } }), // saveTerms is false
      ],
    });
    const raw = localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)!;
    expect(raw).not.toContain('NirvInternal');
    expect(raw).not.toContain('mappings');
    expect(loadPreferencesV2()!.customPacks[0].terms.mappings).toBeUndefined();
  });

  it('persists mapping terms only when the pack saveTerms opt-in is on too', () => {
    const mapping = {
      id: 'map-1',
      term: 'NirvInternal',
      replacement: 'SourceSystem',
      categoryLabel: 'Organization',
      severity: 'medium' as const,
      matchMode: 'ci-literal' as const,
      codeSafe: true,
      strategy: 'code-only' as const,
    };
    // No global save at all -> nothing in storage (the first opt-in).
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)).toBeNull();

    // Global save + per-pack saveTerms (the second opt-in) -> round-trips.
    savePreferencesV2({
      version: 2,
      activeProfileId: 'balanced',
      profiles: [],
      customPacks: [
        customPack({ terms: { ...emptyPackTerms(), saveTerms: true, mappings: [mapping] } }),
      ],
    });
    const loaded = loadPreferencesV2()!.customPacks[0].terms.mappings;
    expect(loaded).toHaveLength(1);
    expect(loaded![0].term).toBe('NirvInternal');
    expect(loaded![0].strategy).toBe('code-only');
  });

  it('discards unknown fields, unknown ids, malformed rules, and oversized arrays', () => {
    const stored = {
      version: 2,
      activeProfileId: 'ghost',
      sourceText: 'never',
      profiles: [
        { ...namedProfile({ id: 'ok-1' }), packIds: ['pack-ca-v1', 'pack-fake'], overrides: { email: false, fake: true }, extra: 1 },
        { id: 'bad', name: '' }, // malformed
        ...Array.from({ length: 30 }, (_, i) => namedProfile({ id: `over-${i}` })),
      ],
      customPacks: [
        {
          ...customPack({ id: 'cp-ok' }),
          detectorIds: ['us-ssn', 'not-a-rule'],
          rules: [
            ...customPack().rules,
            { id: 'r-bad', name: 'Bad', labels: [], valueType: 'digits', placeholderLabel: 'X', category: 'personal', severity: 'low', maxLength: 5, enabled: true },
          ],
        },
      ],
    };
    const cleaned = sanitizeV2(stored)!;
    expect(cleaned).not.toHaveProperty('sourceText');
    expect(cleaned.activeProfileId).toBe('balanced'); // unknown id fell back
    expect(cleaned.profiles).toHaveLength(20); // capped
    expect(cleaned.profiles[0].packIds).toEqual(['pack-ca-v1']);
    expect(cleaned.profiles[0].overrides).toEqual({ email: false });
    expect(cleaned.customPacks[0].detectorIds).toEqual(['us-ssn']);
    expect(cleaned.customPacks[0].rules).toHaveLength(1); // malformed rule dropped
  });

  it('rejects invalid placeholder labels in stored custom rules', () => {
    const pack = customPack();
    pack.rules[0].placeholderLabel = 'not-valid!';
    const cleaned = sanitizeV2({ version: 2, activeProfileId: 'balanced', profiles: [], customPacks: [pack] })!;
    expect(cleaned.customPacks[0].rules).toHaveLength(0);
  });

  it('caps terms per pack and term length', () => {
    const pack = customPack({
      terms: {
        ...emptyPackTerms(),
        saveTerms: true,
        values: [...Array.from({ length: 150 }, (_, i) => `term-${i}`), 'x'.repeat(200)],
      },
    });
    const cleaned = sanitizeV2({ version: 2, activeProfileId: 'balanced', profiles: [], customPacks: [pack] })!;
    expect(cleaned.customPacks[0].terms.values.length).toBeLessThanOrEqual(100);
    expect(cleaned.customPacks[0].terms.values.every((t) => t.length <= 120)).toBe(true);
  });

  it('rejects corrupted or wrong-version data', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY_V2, 'not json {');
    expect(loadPreferencesV2()).toBeNull();
    localStorage.setItem(PREFERENCES_STORAGE_KEY_V2, JSON.stringify({ version: 99 }));
    expect(loadPreferencesV2()).toBeNull();
  });

  it('clearPreferences deletes both the v1 and v2 keys', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, '{"version":1}');
    savePreferencesV2(defaultPreferencesV2());
    expect(hasStoredPreferences()).toBe(true);
    clearPreferences();
    expect(hasStoredPreferences()).toBe(false);
    expect(localStorage.length).toBe(0);
  });

  it('is a safe no-op without storage', () => {
    vi.stubGlobal('localStorage', undefined);
    expect(loadPreferencesV2()).toBeNull();
    expect(() => savePreferencesV2(defaultPreferencesV2())).not.toThrow();
    expect(() => clearPreferences()).not.toThrow();
    expect(hasStoredPreferences()).toBe(false);
  });
});

describe('v1 to v2 migration', () => {
  const v1 = (over: Record<string, unknown> = {}) => ({
    version: 1,
    profile: 'balanced',
    ruleStates: {},
    format: { id: 'indexed', customTemplate: '[{TYPE}_{INDEX}]' },
    ...over,
  });

  it('maps clean balanced/strict v1 prefs to the built-in profile id', () => {
    expect(migrateV1(v1())!.activeProfileId).toBe('balanced');
    const strictStates = Object.fromEntries(
      Object.entries(profileRuleStates('strict')).filter(([, enabled]) => enabled),
    );
    expect(migrateV1(v1({ ruleStates: strictStates }))!.activeProfileId).toBe('strict');
  });

  it('turns customized v1 states into a named profile with overrides', () => {
    const migrated = migrateV1(v1({ ruleStates: { email: false }, format: { id: 'uniform', customTemplate: '[{TYPE}_{INDEX}]' } }))!;
    expect(migrated.profiles).toHaveLength(1);
    expect(migrated.profiles[0].overrides).toEqual({ email: false });
    expect(migrated.profiles[0].format.id).toBe('uniform');
    expect(migrated.activeProfileId).toBe(migrated.profiles[0].id);
  });

  it('loadPreferencesV2 migrates a stored v1 key, writes v2, and removes v1', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(v1({ ruleStates: { email: false } })));
    const loaded = loadPreferencesV2()!;
    expect(loaded.profiles[0].name).toBe('Migrated settings');
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY_V2)).not.toBeNull();
  });

  it('drops an unreadable v1 key without creating v2 data', () => {
    localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ version: 7 }));
    expect(loadPreferencesV2()).toBeNull();
    expect(localStorage.getItem(PREFERENCES_STORAGE_KEY)).toBeNull();
  });
});
