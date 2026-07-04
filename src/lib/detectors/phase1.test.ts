import { describe, expect, it } from 'vitest';
import { phoneDetector, dobDetector, plausibleDob } from './pii';
import { privateKeyDetector } from './privatekeys';
import { isLikelyCardNumber, luhnValid } from './paymentcards';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

/** Append the Luhn check digit that makes a body valid. */
function withCheckDigit(body: string): string {
  for (let d = 0; d <= 9; d += 1) {
    if (luhnValid(body + d)) return body + d;
  }
  throw new Error('unreachable');
}

describe('phase 1: phone regressions', () => {
  it('never partially redacts a longer digit sequence', () => {
    // 12 contiguous digits: matching would leave trailing digits, so no match.
    expect(values(phoneDetector, 'Phone: 555123456789')).toEqual([]);
    expect(values(phoneDetector, 'Phone: 555-123-4567-89')).toEqual([]);
    const text = 'Phone: 555123456789 end';
    expect(buildCleanText(text, scanText(text, { enabledDetectorIds: ['phone-number'] }))).toBe(
      text,
    );
  });

  it('rejects a plus sign without a valid NANP country code', () => {
    expect(values(phoneDetector, 'Phone: +44 555 123 4567')).toEqual([]);
    expect(values(phoneDetector, 'Phone: +49 5551234567')).toEqual([]);
  });

  it('still accepts valid labeled shapes', () => {
    expect(values(phoneDetector, 'Phone: +1 555.123.4567')).toEqual(['+1 555.123.4567']);
    expect(values(phoneDetector, 'Phone: 15551234567')).toEqual(['15551234567']);
    expect(values(phoneDetector, 'Phone: (555) 123-4567 ext 42')).toEqual([
      '(555) 123-4567 ext 42',
    ]);
  });
});

describe('phase 1: DOB calendar validation', () => {
  it('accepts real dates in every format', () => {
    expect(plausibleDob('1990-02-28')).toBe(true);
    expect(plausibleDob('2000-02-29')).toBe(true); // leap year
    expect(plausibleDob('12/31/1999')).toBe(true);
    expect(plausibleDob('31/12/1999')).toBe(true); // d/m ordering
    expect(plausibleDob('February 29, 2000')).toBe(true);
    expect(values(dobDetector, 'DOB: 1990-01-31')).toEqual(['1990-01-31']);
  });

  it('rejects impossible dates', () => {
    expect(plausibleDob('1990-02-30')).toBe(false);
    expect(plausibleDob('1999-02-29')).toBe(false); // not a leap year
    expect(plausibleDob('1990-00-10')).toBe(false);
    expect(plausibleDob('31/31/1999')).toBe(false); // no valid ordering
    expect(plausibleDob('Febtember 3, 1990')).toBe(false);
    expect(values(dobDetector, 'DOB: 1990-02-30')).toEqual([]);
  });

  it('rejects unreasonable birth years', () => {
    expect(plausibleDob('1850-01-01')).toBe(false);
    expect(plausibleDob('2900-01-01')).toBe(false);
    expect(values(dobDetector, 'DOB: 2899-01-01')).toEqual([]);
  });
});

describe('phase 1: issuer-specific card lengths', () => {
  it('accepts each issuer only at its real lengths', () => {
    expect(isLikelyCardNumber(withCheckDigit('411111111111'))).toBe(true); // Visa 13
    expect(isLikelyCardNumber(withCheckDigit('411111111111111'))).toBe(true); // Visa 16
    expect(isLikelyCardNumber(withCheckDigit('4111111111111'))).toBe(false); // Visa 14: invalid
    expect(isLikelyCardNumber(withCheckDigit('37828224631000'))).toBe(true); // Amex 15
    expect(isLikelyCardNumber(withCheckDigit('378282246310005'))).toBe(false); // Amex 16: invalid
    expect(isLikelyCardNumber(withCheckDigit('510510510510510'))).toBe(true); // MC 16
    expect(isLikelyCardNumber(withCheckDigit('51051051051051'))).toBe(false); // MC 15: invalid
  });

  it('validates the Mastercard 2-series boundaries precisely', () => {
    expect(isLikelyCardNumber(withCheckDigit('222100000000000'))).toBe(true); // 2221 in range
    expect(isLikelyCardNumber(withCheckDigit('272000000000000'))).toBe(true); // 2720 in range
    expect(isLikelyCardNumber(withCheckDigit('222000000000000'))).toBe(false); // 2220 below
    expect(isLikelyCardNumber(withCheckDigit('272100000000000'))).toBe(false); // 2721 above
  });
});

describe('phase 1: private key BEGIN/END correspondence', () => {
  it('rejects mismatched BEGIN and END types', () => {
    const mismatched =
      '-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----';
    expect(values(privateKeyDetector, mismatched)).toEqual([]);
    const missingBlock =
      '-----BEGIN PGP PRIVATE KEY BLOCK-----\nabc\n-----END PGP PRIVATE KEY-----';
    expect(values(privateKeyDetector, missingBlock)).toEqual([]);
  });

  it('still matches corresponding pairs', () => {
    const ok = '-----BEGIN EC PRIVATE KEY-----\nabc\n-----END EC PRIVATE KEY-----';
    expect(values(privateKeyDetector, ok)).toEqual([ok]);
  });
});
