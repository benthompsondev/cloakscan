import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Payment card numbers (PANs): 13–19 digits, optionally grouped with spaces
 * or dashes. Every candidate must pass all three gates:
 *   1. length 13–19 after removing separators,
 *   2. a plausible issuer range (Visa/Mastercard/Amex/Discover/JCB/Diners),
 *   3. the Luhn checksum.
 * Lookarounds stop candidates from starting or ending inside longer
 * digit/dash runs (GUIDs, serial numbers).
 */
const CARD_CANDIDATE_RE = /(?<![\d-])(?:\d[ -]?){12,18}\d(?![\d-])/g;

export function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

/**
 * Major issuer IIN ranges with their issuer-specific valid lengths.
 * A candidate must match a known range AND one of that issuer's lengths —
 * a 14-digit "Visa" or 16-digit "Amex" is rejected.
 */
const ISSUERS: { iin: RegExp; lengths: number[] }[] = [
  { iin: /^4/, lengths: [13, 16, 19] }, // Visa
  { iin: /^5[1-5]/, lengths: [16] }, // Mastercard (51-55)
  { iin: /^(?:222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/, lengths: [16] }, // Mastercard 2221-2720
  { iin: /^3[47]/, lengths: [15] }, // American Express
  { iin: /^6(?:011|4[4-9]|5)/, lengths: [16, 17, 18, 19] }, // Discover
  { iin: /^35(?:2[89]|[3-8]\d)/, lengths: [16, 17, 18, 19] }, // JCB (3528-3589)
  { iin: /^3(?:0[0-5]|[689])/, lengths: [14, 15, 16, 17, 18, 19] }, // Diners Club
];

export function isLikelyCardNumber(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (digits.length < 13 || digits.length > 19) return false;
  // Filler like 4444...444(8) can carry a valid check digit; no real PAN has
  // an all-identical body, so reject when everything before the check digit
  // is one repeated digit.
  if (/^(\d)\1*$/.test(digits.slice(0, -1))) return false;
  const issuer = ISSUERS.find((i) => i.iin.test(digits));
  if (!issuer || !issuer.lengths.includes(digits.length)) return false;
  return luhnValid(digits);
}

export const paymentCardDetector: Detector = {
  id: 'payment-card',
  name: 'Payment card number',
  category: 'personal',
  severity: 'high',
  label: 'CREDIT_CARD',
  priority: 84,
  explanation: 'Card numbers are regulated payment data (PCI DSS) and enable direct fraud.',
  detect: (text) =>
    regexMatches(text, CARD_CANDIDATE_RE, {
      confidenceFor: (value) => {
        if (!isLikelyCardNumber(value)) return null;
        // Grouped formatting is a strong human signal on top of the checks.
        return /[ -]/.test(value) ? 'high' : 'medium';
      },
    }),
};
