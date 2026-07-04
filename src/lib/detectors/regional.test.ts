import { describe, expect, it } from 'vitest';
import {
  caPostalCodeDetector,
  usSsnDetector,
  usZipDetector,
  ibanDetector,
  isValidSsn,
  isValidIban,
} from './regional';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';
import { BUILT_IN_PACKS } from '../packs';
import { resolveRuleStates, BALANCED_PROFILE, enabledRuleIds } from '../profiles';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

const withPacks = (packIds: string[]) =>
  enabledRuleIds(resolveRuleStates({ ...BALANCED_PROFILE, packIds }));

describe('Canadian postal code', () => {
  it('finds spaced and compact codes with address context', () => {
    expect(values(caPostalCodeDetector, 'Address: 123 Demo St, Exampleville ON K1A 0B1')).toEqual([
      'K1A 0B1',
    ]);
    expect(values(caPostalCodeDetector, 'PostalCode = K1A0B1')).toEqual(['K1A0B1']);
    expect(values(caPostalCodeDetector, 'ZIP: M5V 3L9 (office)')).toEqual(['M5V 3L9']);
  });

  it('requires context — arbitrary standalone codes are not flagged', () => {
    expect(values(caPostalCodeDetector, 'the sample K1A 0B1 appears mid-sentence')).toEqual([]);
  });

  it('enforces Canadian letter restrictions', () => {
    expect(values(caPostalCodeDetector, 'PostalCode: D1A 0B1')).toEqual([]); // D never first
    expect(values(caPostalCodeDetector, 'PostalCode: K1O 0B1')).toEqual([]); // O never appears
    expect(values(caPostalCodeDetector, 'PostalCode: W1A 0B1')).toEqual([]); // W never first
  });

  it('never crosses line boundaries', () => {
    expect(values(caPostalCodeDetector, 'PostalCode:\nK1A 0B1')).toEqual([]);
    expect(values(caPostalCodeDetector, 'Address: 1 Demo St\nK1A 0B1 alone')).toEqual([]);
  });

  it('yields to the address rule on overlap (address redacts the whole value)', () => {
    const text = 'Address: 123 Demo Street, Exampleville ON K1A 0B1';
    const ids = withPacks(['pack-ca-v1']);
    const findings = scanText(text, { enabledDetectorIds: ids });
    expect(buildCleanText(text, findings)).toBe('Address: [ADDRESS_1]');
  });
});

describe('US SSN', () => {
  it('validates issued ranges', () => {
    expect(isValidSsn('123-45-6789')).toBe(true);
    expect(isValidSsn('000-45-6789')).toBe(false); // area 000
    expect(isValidSsn('666-45-6789')).toBe(false); // area 666
    expect(isValidSsn('923-45-6789')).toBe(false); // area 9xx
    expect(isValidSsn('123-00-6789')).toBe(false); // group 00
    expect(isValidSsn('123-45-0000')).toBe(false); // serial 0000
  });

  it('finds labeled SSNs in any grouping at high confidence', () => {
    const [m] = usSsnDetector.detect('SSN: 123456789');
    expect(m.value).toBe('123456789');
    expect(m.confidence).toBe('high');
    expect(values(usSsnDetector, 'Social Security Number = 123 45 6789')).toEqual(['123 45 6789']);
  });

  it('finds unlabeled SSNs only in the canonical dashed shape, at medium confidence', () => {
    const [m] = usSsnDetector.detect('applicant 123-45-6789 approved');
    expect(m.confidence).toBe('medium');
    expect(values(usSsnDetector, 'ref 123456789 paid')).toEqual([]); // bare 9 digits: never
    expect(values(usSsnDetector, 'ref 123 45 6789 paid')).toEqual([]); // spaced needs a label
  });

  it('rejects reserved groups even when labeled', () => {
    expect(values(usSsnDetector, 'SSN: 000-12-3456')).toEqual([]);
    expect(values(usSsnDetector, 'SSN: 900-12-3456')).toEqual([]);
  });

  it('respects boundaries and lines', () => {
    expect(values(usSsnDetector, 'id 9123-45-6789 end')).toEqual([]); // inside longer run
    expect(values(usSsnDetector, 'SSN:\n123-45-6789').map((v) => v)).toEqual(['123-45-6789']); // label on
    // its own line does not match as labeled...
    const [m] = usSsnDetector.detect('SSN:\n123-45-6789');
    expect(m.confidence).toBe('medium'); // ...only as the grouped shape
  });
});

describe('US ZIP code', () => {
  it('finds 5-digit and ZIP+4 with context', () => {
    expect(values(usZipDetector, 'ZIP: 12345')).toEqual(['12345']);
    expect(values(usZipDetector, 'Address: 1 Demo St, Exampletown ZIP: 12345-6789')).toEqual([
      '12345-6789',
    ]);
  });

  it('never flags arbitrary five-digit values', () => {
    expect(values(usZipDetector, 'invoice 12345 shipped')).toEqual([]);
    expect(values(usZipDetector, 'port 12345 open')).toEqual([]);
  });

  it('never crosses lines and respects digit boundaries', () => {
    expect(values(usZipDetector, 'ZIP:\n12345')).toEqual([]);
    expect(values(usZipDetector, 'ZIP: 123456')).toEqual([]); // six digits: not a ZIP
  });
});

describe('IBAN', () => {
  it('validates country lengths and MOD-97', () => {
    expect(isValidIban('DE89370400440532013000')).toBe(true);
    expect(isValidIban('GB82WEST12345698765432')).toBe(true);
    expect(isValidIban('DE89370400440532013001')).toBe(false); // checksum
    expect(isValidIban('DE8937040044053201300')).toBe(false); // wrong length
    expect(isValidIban('XX89370400440532013000')).toBe(false); // unknown country
  });

  it('finds spaced and compact IBANs', () => {
    expect(values(ibanDetector, 'send to DE89 3704 0044 0532 0130 00 today')).toEqual([
      'DE89 3704 0044 0532 0130 00',
    ]);
    expect(values(ibanDetector, 'acct GB82WEST12345698765432.')).toEqual([
      'GB82WEST12345698765432',
    ]);
  });

  it('accepts lowercase and mixed-case input, preserving the original characters', () => {
    expect(isValidIban('de89370400440532013000')).toBe(true);
    expect(isValidIban('De89370400440532013000')).toBe(true);
    expect(values(ibanDetector, 'send to de89 3704 0044 0532 0130 00 today')).toEqual([
      'de89 3704 0044 0532 0130 00',
    ]);
    expect(values(ibanDetector, 'acct gb82West12345698765432.')).toEqual([
      'gb82West12345698765432',
    ]);
    // Case normalization never rescues an invalid IBAN.
    expect(values(ibanDetector, 'code de89 3704 0044 0532 0130 01 end')).toEqual([]);
    expect(isValidIban('xx89370400440532013000')).toBe(false);
  });

  it('recovers when a following uppercase word joins the candidate run', () => {
    expect(values(ibanDetector, 'BE68 5390 0754 7034 BANK transfer')).toEqual([
      'BE68 5390 0754 7034',
    ]);
  });

  it('rejects checksum failures and arbitrary alphanumeric strings', () => {
    expect(values(ibanDetector, 'code DE89 3704 0044 0532 0130 01 end')).toEqual([]);
    expect(values(ibanDetector, 'build FR12 ABCD 9999 XYZ nope')).toEqual([]);
    expect(values(ibanDetector, 'serial AB12CDEF34567890 end')).toEqual([]);
  });

  it('wins the overlap against the payment-card rule inside its digit groups', () => {
    const text = 'refund DE89 3704 0044 0532 0130 00 issued';
    const findings = scanText(text, { enabledDetectorIds: withPacks(['pack-eu-v1']) });
    expect(findings.map((f) => f.detectorId)).toEqual(['iban']);
    expect(buildCleanText(text, findings)).toBe('refund [IBAN_1] issued');
  });
});

describe('pack wiring', () => {
  it('every pack references only registered detector ids', () => {
    const ids = new Set(enabledRuleIds(resolveRuleStates({ ...BALANCED_PROFILE, packIds: BUILT_IN_PACKS.map((p) => p.id) })));
    for (const pack of BUILT_IN_PACKS) {
      for (const id of pack.detectorIds) {
        expect(ids.has(id), `${pack.id} -> ${id}`).toBe(true);
      }
    }
  });

  it('pack-only rules stay off without a pack, on Balanced and Strict alike', () => {
    const text = 'SSN: 123-45-6789 and IBAN DE89 3704 0044 0532 0130 00 and PostalCode: K1A 0B1';
    expect(scanText(text)).toEqual([]);
    const strictIds = enabledRuleIds(resolveRuleStates({ ...BALANCED_PROFILE, core: 'strict' }));
    expect(
      scanText(text, { enabledDetectorIds: strictIds }).map((f) => f.detectorId),
    ).toEqual([]);
  });

  it('activating a pack together with Strict core produces no duplicate findings', () => {
    const text = 'SIN: 123 456 782';
    const ids = enabledRuleIds(
      resolveRuleStates({ ...BALANCED_PROFILE, core: 'strict', packIds: ['pack-ca-v1'] }),
    );
    // canadian-sin is enabled by both Strict core and the Canada pack.
    expect(ids.filter((id) => id === 'canadian-sin')).toHaveLength(1);
    const findings = scanText(text, { enabledDetectorIds: ids });
    expect(findings.filter((f) => f.detectorId === 'canadian-sin')).toHaveLength(1);
  });
});
