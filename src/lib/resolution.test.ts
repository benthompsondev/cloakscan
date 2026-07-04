import { describe, expect, it } from 'vitest';
import {
  BALANCED_PROFILE,
  STRICT_PROFILE,
  resolveRuleStates,
  enabledRuleIds,
  sameConfig,
  generateId,
  validateName,
  type ProfileConfig,
} from './profiles';
import {
  cloakListSaveBlocker,
  createFieldRuleDetector,
  customPackSaveBlocker,
  detectorsFromCustomPacks,
  emptyPackTerms,
  scanFieldRule,
  validateCustomRule,
  type CustomFieldRule,
  type CustomPack,
} from './customPacks';
import { analyzePrivateTerms, createPrivateTermsDetector } from './customTerms';
import { scanText } from './scan';
import { buildCleanText } from './sanitize';

const profile = (over: Partial<ProfileConfig>): ProfileConfig => ({
  ...BALANCED_PROFILE,
  packIds: [],
  customPackIds: [],
  overrides: {},
  ...over,
});

const rule = (over: Partial<CustomFieldRule> = {}): CustomFieldRule => ({
  id: 'r1',
  name: 'Badge number',
  labels: ['BadgeId', 'Badge Number'],
  valueType: 'digits',
  placeholderLabel: 'BADGE_ID',
  category: 'personal',
  severity: 'medium',
  maxLength: 20,
  enabled: true,
  ...over,
});

const pack = (over: Partial<CustomPack> = {}): CustomPack => ({
  id: 'cp1',
  name: 'Team pack',
  detectorIds: [],
  rules: [rule()],
  terms: emptyPackTerms(),
  enabled: true,
  ...over,
});

describe('core + pack + override resolution', () => {
  it('packs enable rules on top of the core, overrides win last', () => {
    const states = resolveRuleStates(
      profile({ packIds: ['pack-us-v1'], overrides: { 'us-zip': false, email: false } }),
    );
    expect(states['us-ssn']).toBe(true); // pack enabled it
    expect(states['us-zip']).toBe(false); // override beat the pack
    expect(states.email).toBe(false); // override beat the core
    expect(states['canadian-sin']).toBe(false); // not core, not in this pack
  });

  it('custom packs enable registry rules, respecting the pack master switch', () => {
    const cp = pack({ detectorIds: ['us-ssn'], rules: [] });
    const config = profile({ customPackIds: ['cp1'] });
    expect(resolveRuleStates(config, [cp])['us-ssn']).toBe(true);
    expect(resolveRuleStates(config, [{ ...cp, enabled: false }])['us-ssn']).toBe(false);
  });

  it('deduplicates: a rule enabled by core, pack, and override runs once', () => {
    const config = profile({
      core: 'strict',
      packIds: ['pack-ca-v1'],
      overrides: { 'canadian-sin': true },
    });
    const ids = enabledRuleIds(resolveRuleStates(config));
    expect(ids.filter((id) => id === 'canadian-sin')).toHaveLength(1);
  });

  it('built-in profiles are frozen', () => {
    expect(Object.isFrozen(BALANCED_PROFILE)).toBe(true);
    expect(Object.isFrozen(STRICT_PROFILE)).toBe(true);
    expect(() => {
      (BALANCED_PROFILE as { core: string }).core = 'strict';
    }).toThrow();
  });

  it('sameConfig detects equivalence and divergence', () => {
    expect(sameConfig(profile({}), profile({}))).toBe(true);
    expect(sameConfig(profile({}), profile({ packIds: ['pack-ca-v1'] }))).toBe(false);
    expect(sameConfig(profile({}), profile({ overrides: { email: false } }))).toBe(false);
  });

  it('generates unique ids and validates names', () => {
    expect(generateId('profile')).not.toBe(generateId('profile'));
    expect(validateName('Ops team')).toBeNull();
    expect(validateName('')).toMatch(/empty/);
    expect(validateName('x'.repeat(41))).toMatch(/40/);
  });
});

describe('custom labeled-field rules', () => {
  it('matches labeled values of each type, same line only', () => {
    const digits = createFieldRuleDetector('cp1', rule());
    expect(digits.detect('BadgeId: 12345').map((m) => m.value)).toEqual(['12345']);
    expect(digits.detect('Badge Number = 98-76 54').map((m) => m.value)).toEqual(['98-76 54']);
    expect(digits.detect('BadgeId:\n12345')).toEqual([]);

    const ident = createFieldRuleDetector('cp1', rule({ valueType: 'identifier' }));
    expect(ident.detect('BadgeId: AB-1234.x').map((m) => m.value)).toEqual(['AB-1234.x']);

    const text = createFieldRuleDetector('cp1', rule({ valueType: 'text', maxLength: 40 }));
    expect(text.detect('BadgeId: front desk pass nine').map((m) => m.value)).toEqual([
      'front desk pass nine',
    ]);
  });

  it('skips the ENTIRE candidate when it exceeds maxLength — never a prefix', () => {
    const detector = createFieldRuleDetector('cp1', rule({ valueType: 'text', maxLength: 15 }));
    // 20 chars > 15: no match at all, not a truncated one.
    expect(detector.detect('BadgeId: front desk pass nine')).toEqual([]);

    // Through the full engine the text comes back completely unchanged:
    // no placeholder, and no partially redacted remainder.
    const text = 'BadgeId: front desk pass nine';
    const findings = scanText(text, { enabledDetectorIds: [], extraDetectors: [detector] });
    expect(buildCleanText(text, findings)).toBe(text);

    // The skip is reported so the preview can explain it.
    const { matches, skippedTooLong } = scanFieldRule(
      rule({ valueType: 'text', maxLength: 15 }),
      text,
    );
    expect(matches).toEqual([]);
    expect(skippedTooLong).toEqual([{ start: 9, length: 20 }]);

    // At or under the limit still matches normally.
    const exact = createFieldRuleDetector('cp1', rule({ valueType: 'text', maxLength: 20 }));
    expect(exact.detect(text).map((m) => m.value)).toEqual(['front desk pass nine']);

    // Same guarantee for digits: an over-limit run is skipped whole.
    const digits = createFieldRuleDetector('cp1', rule({ maxLength: 4 }));
    expect(digits.detect('BadgeId: 123456789')).toEqual([]);
    expect(digits.detect('BadgeId: 1234').map((m) => m.value)).toEqual(['1234']);
  });

  it('redacts only the content inside matching quotes', () => {
    const t = createFieldRuleDetector(
      'cp1',
      rule({ valueType: 'text', maxLength: 40, placeholderLabel: 'CUSTOM_ID' }),
    );

    // Double quotes: quotes and trailing text survive.
    const dq = 'Department: "Operations" Status: Active';
    const dqRule = rule({ valueType: 'text', labels: ['Department'], placeholderLabel: 'CUSTOM_ID' });
    const dqDetector = createFieldRuleDetector('cp1', dqRule);
    expect(dqDetector.detect(dq).map((m) => m.value)).toEqual(['Operations']);
    const findings = scanText(dq, { enabledDetectorIds: [], extraDetectors: [dqDetector] });
    expect(buildCleanText(dq, findings)).toBe('Department: "[CUSTOM_ID_1]" Status: Active');

    // Single quotes behave identically.
    const sq = "Department: 'Operations' Status: Active";
    const sqFindings = scanText(sq, { enabledDetectorIds: [], extraDetectors: [dqDetector] });
    expect(buildCleanText(sq, sqFindings)).toBe("Department: '[CUSTOM_ID_1]' Status: Active");

    // Unquoted same-line text still captures to end of line.
    expect(t.detect('BadgeId: Operations Status Active').map((m) => m.value)).toEqual([
      'Operations Status Active',
    ]);

    // Quoted digits stop at the closing quote too.
    const digits = createFieldRuleDetector('cp1', rule());
    expect(digits.detect('BadgeId: "4455" extra 999').map((m) => m.value)).toEqual(['4455']);

    // Never match the empty inside of "" or ''.
    expect(dqDetector.detect('Department: "" Status: Active')).toEqual([]);
    expect(dqDetector.detect("Department: '' Status: Active")).toEqual([]);
  });

  it('quoted values respect CRLF boundaries and unclosed quotes stay on one line', () => {
    const detector = createFieldRuleDetector(
      'cp1',
      rule({ valueType: 'text', labels: ['Department'], placeholderLabel: 'CUSTOM_ID' }),
    );

    // A close quote on the NEXT line never pulls the value across it (CRLF and LF).
    expect(detector.detect('Department: "Operations\r\nnext" line').map((m) => m.value)).toEqual([
      'Operations',
    ]);
    expect(detector.detect('Department: "Operations\nnext" line').map((m) => m.value)).toEqual([
      'Operations',
    ]);

    // Unclosed quote: redact from after the opening quote to end of line only.
    const unclosed = 'Department: "Operations\r\nStatus: Active';
    const findings = scanText(unclosed, { enabledDetectorIds: [], extraDetectors: [detector] });
    expect(buildCleanText(unclosed, findings)).toBe(
      'Department: "[CUSTOM_ID_1]\r\nStatus: Active',
    );
  });

  it('never matches empty values, variables, expressions, or command calls', () => {
    const t = createFieldRuleDetector('cp1', rule({ valueType: 'text' }));
    expect(t.detect('BadgeId: ')).toEqual([]);
    expect(t.detect('BadgeId: $badge')).toEqual([]);
    expect(t.detect('BadgeId: (Get-Badge)')).toEqual([]);
    expect(t.detect('BadgeId: Get-Badge')).toEqual([]);
    expect(t.detect('BadgeId: &invoke')).toEqual([]);
  });

  it('participates in normal overlap resolution and redacts with its placeholder', () => {
    const detector = createFieldRuleDetector('cp1', rule());
    const text = 'BadgeId: 4455 issued to alex.demo@example.internal';
    const findings = scanText(text, { extraDetectors: [detector] });
    expect(buildCleanText(text, findings)).toBe('BadgeId: [BADGE_ID_1] issued to [EMAIL_1]');
  });

  it('validates rule shape strictly', () => {
    expect(validateCustomRule(rule())).toBeNull();
    expect(validateCustomRule(rule({ name: '' }))).toMatch(/empty/);
    expect(validateCustomRule(rule({ labels: [] }))).toMatch(/label/);
    expect(validateCustomRule(rule({ labels: Array(11).fill('x') }))).toMatch(/10/);
    expect(validateCustomRule(rule({ placeholderLabel: 'bad-label' }))).toMatch(/uppercase/i);
    expect(validateCustomRule(rule({ maxLength: 0 }))).toMatch(/length/i);
    expect(validateCustomRule(rule({ maxLength: 999 }))).toMatch(/length/i);
  });

  it('detectorsFromCustomPacks respects enabled flags and rule validity', () => {
    const active = detectorsFromCustomPacks([pack()], ['cp1']);
    expect(active).toHaveLength(1);
    expect(detectorsFromCustomPacks([pack({ enabled: false })], ['cp1'])).toEqual([]);
    expect(detectorsFromCustomPacks([pack()], [])).toEqual([]);
    expect(
      detectorsFromCustomPacks([pack({ rules: [rule({ enabled: false })] })], ['cp1']),
    ).toEqual([]);
    expect(
      detectorsFromCustomPacks([pack({ rules: [rule({ placeholderLabel: 'nope!' })] })], ['cp1']),
    ).toEqual([]);
  });
});

describe('save blockers for ambiguous empty creations', () => {
  it('a NEW Cloak List cannot be saved without at least one valid term', () => {
    expect(cloakListSaveBlocker(true, 0)).toMatch(/at least one valid term/);
    expect(cloakListSaveBlocker(true, 1)).toBeNull();
  });

  it('an EXISTING Cloak List may be edited or cleared to zero terms', () => {
    // Term values not opted into local save legitimately vanish on reload.
    expect(cloakListSaveBlocker(false, 0)).toBeNull();
  });

  it('a Custom Pack with neither a detector nor a rule cannot be saved', () => {
    expect(customPackSaveBlocker(0, 0)).toMatch(/create a Cloak List instead/i);
  });

  it('one registry detector or one labeled-field rule makes a Custom Pack saveable', () => {
    expect(customPackSaveBlocker(1, 0)).toBeNull();
    expect(customPackSaveBlocker(0, 1)).toBeNull();
  });
});

describe('cloak term options', () => {
  it('analyzes duplicates and too-short lines', () => {
    const parsed = analyzePrivateTerms('Contoso\ncontoso\nx\nContoso General\n');
    expect(parsed.terms).toEqual(['Contoso General', 'Contoso']);
    expect(parsed.duplicates).toEqual([2]);
    expect(parsed.tooShort).toEqual([3]);
  });

  it('case-sensitive mode distinguishes case, both in parsing and matching', () => {
    const parsed = analyzePrivateTerms('Contoso\ncontoso', true);
    expect(parsed.terms).toEqual(['Contoso', 'contoso']);

    const detector = createPrivateTermsDetector(['Contoso'], {
      caseSensitive: true,
      matchInsideWords: true,
    });
    expect(detector.detect('Contoso met CONTOSO').map((m) => m.value)).toEqual(['Contoso']);
  });

  it('whole-token mode refuses to match inside words', () => {
    const inside = createPrivateTermsDetector(['demo'], {
      caseSensitive: false,
      matchInsideWords: true,
    });
    expect(inside.detect('demos of demo').map((m) => m.value)).toEqual(['demo', 'demo']);

    const whole = createPrivateTermsDetector(['demo'], {
      caseSensitive: false,
      matchInsideWords: false,
    });
    expect(whole.detect('demos of demo').map((m) => m.value)).toEqual(['demo']);
  });

  it('session terms flow through scanText with options', () => {
    const text = 'Demos by demo team';
    const cleaned = buildCleanText(
      text,
      scanText(text, {
        privateTerms: ['demo'],
        termsOptions: { caseSensitive: true, matchInsideWords: false },
      }),
    );
    expect(cleaned).toBe('Demos by [CUSTOM_TERM_1] team');
  });
});
