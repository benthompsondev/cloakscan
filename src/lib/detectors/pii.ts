import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';
import { luhnValid } from './paymentcards';

/**
 * Strict-profile PII detectors. Every rule here requires an explicitly
 * labeled, same-line field ([ \t] only — labels and values never cross or
 * absorb a line boundary) or, for SINs, a checksummed grouped format.
 * None of them guess at free text.
 */

/**
 * Phone numbers in labeled fields: Phone:, Mobile=, Tel:, Fax:. NANP shapes.
 * A leading plus sign must be +1 (the only NANP country code), and the match
 * must consume the entire digit run — a longer sequence is rejected outright
 * rather than partially redacted with trailing digits left behind.
 */
const PHONE_RE =
  /\b(?:[Pp]hone(?:[ _]?[Nn]umber)?|[Mm]obile|[Cc]ell|[Tt]el(?:ephone)?|[Ff]ax)\b[ \t]*[:=][ \t]*["']?((?:\+?1[ \t.-]?)?\(?\d{3}\)?[ \t.-]?\d{3}[ \t.-]?\d{4}(?:[ \t]*(?:x|ext\.?)[ \t]*\d{1,5})?)(?![\d-])/g;

export const phoneDetector: Detector = {
  id: 'phone-number',
  name: 'Phone number (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'PHONE',
  priority: 57,
  strictOnly: true,
  explanation: 'A phone number in an explicit Phone/Mobile/Tel-style field.',
  detect: (text) => regexMatches(text, PHONE_RE, { group: 1, confidenceFor: () => 'high' }),
};

/**
 * Physical addresses in labeled same-line fields. The value must start with a
 * street number — prose after "Address:" is not guessed at.
 */
const ADDRESS_RE =
  /\b(?:[Ss]treet[ _]?[Aa]ddress|[Hh]ome[ _]?[Aa]ddress|[Mm]ailing[ _]?[Aa]ddress|[Aa]ddress|[Ss]treet)\b[ \t]*[:=][ \t]*["']?(\d{1,6}[ \t]+[A-Za-z0-9 .,'#/-]{3,78}[A-Za-z0-9.])/g;

export const addressDetector: Detector = {
  id: 'physical-address',
  name: 'Physical address (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'ADDRESS',
  priority: 54,
  strictOnly: true,
  explanation: 'A street address in an explicit Address-style field.',
  detect: (text) => regexMatches(text, ADDRESS_RE, { group: 1, confidenceFor: () => 'medium' }),
};

/** Dates of birth in DOB/DateOfBirth/BirthDate fields, common date shapes. */
const DOB_RE =
  /\b(?:DOB|[Dd]ate[ _]?[Oo]f[ _]?[Bb]irth|[Bb]irth[ _]?[Dd]ate|[Bb]irthday)\b[ \t]*[:=][ \t]*["']?(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Z][a-z]+ \d{1,2},? \d{4})\b/g;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate(); // month is 1-based here
}

/** A birth year must be plausible for a living person. */
function reasonableYear(year: number): boolean {
  return year >= 1900 && year <= new Date().getFullYear();
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (!reasonableYear(year) || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year, month);
}

/**
 * Every DOB format is validated as a real calendar date (leap years included)
 * with a 1900..current-year birth year. Slashed dates accept both m/d and d/m
 * orderings; two-digit years expand to the most recent matching year.
 */
export function plausibleDob(value: string): boolean {
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return validCalendarDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const slashed = value.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (slashed) {
    const a = Number(slashed[1]);
    const b = Number(slashed[2]);
    let year = Number(slashed[3]);
    if (slashed[3].length === 2) {
      const century = new Date().getFullYear() % 100;
      year += year <= century ? 2000 : 1900;
    }
    if (slashed[3].length === 3) return false;
    // Accept either m/d or d/m ordering, but the date must be real either way.
    return validCalendarDate(year, a, b) || validCalendarDate(year, b, a);
  }

  const written = value.match(/^([A-Z][a-z]+) (\d{1,2}),? (\d{4})$/);
  if (written) {
    const month = MONTH_NAMES.indexOf(written[1].toLowerCase()) + 1;
    if (month === 0) return false;
    return validCalendarDate(Number(written[3]), month, Number(written[2]));
  }

  return false;
}

export const dobDetector: Detector = {
  id: 'date-of-birth',
  name: 'Date of birth (labeled field)',
  category: 'personal',
  severity: 'high',
  label: 'DOB',
  priority: 56,
  strictOnly: true,
  explanation: 'Birth dates are core identity data and rarely belong in shared text.',
  detect: (text) =>
    regexMatches(text, DOB_RE, {
      group: 1,
      confidenceFor: (value) => (plausibleDob(value) ? 'high' : null),
    }),
};

/**
 * Canadian Social Insurance Numbers. Two contexts, both checksummed:
 * - labeled: SIN: 123 456 782 (any grouping, high confidence)
 * - unlabeled but conventionally grouped: 123-456-782 / 123 456 782
 *   (medium confidence; bare 9-digit runs are deliberately NOT flagged)
 * Validity: 9 digits, Luhn checksum, and a leading digit the program
 * actually issues (not 0, not 8).
 */
const SIN_LABELED_RE =
  /\b(?:SIN|[Ss]ocial[ \t]?[Ii]nsurance(?:[ \t]?[Nn]umber)?)\b[ \t]*[:#=][ \t]*["']?(\d{3}[ \t-]?\d{3}[ \t-]?\d{3})\b/g;
const SIN_GROUPED_RE = /(?<![\d-])\d{3}([ -])\d{3}\1\d{3}(?![\d-])/g;

export function isValidSin(value: string): boolean {
  const digits = value.replace(/[ \t-]/g, '');
  if (!/^\d{9}$/.test(digits)) return false;
  if (digits[0] === '0' || digits[0] === '8') return false;
  return luhnValid(digits);
}

export const sinDetector: Detector = {
  id: 'canadian-sin',
  name: 'Canadian SIN',
  category: 'personal',
  severity: 'high',
  label: 'SIN',
  priority: 62,
  strictOnly: true,
  explanation: 'Social Insurance Numbers enable identity theft and are legally protected.',
  detect: (text): RawMatch[] => [
    ...regexMatches(text, SIN_LABELED_RE, {
      group: 1,
      confidenceFor: (value) => (isValidSin(value) ? 'high' : null),
    }),
    ...regexMatches(text, SIN_GROUPED_RE, {
      confidenceFor: (value) => (isValidSin(value) ? 'medium' : null),
    }),
  ],
};

/**
 * Health identifiers in explicit MRN/HealthCard/PatientID-style fields.
 * The value must be 6–15 identifier characters containing at least four
 * digits, so words like "pending" in those fields are ignored.
 */
const HEALTH_ID_RE =
  /\b(?:MRN|[Mm]edical[ \t]?[Rr]ecord(?:[ \t]?[Nn]umber)?|[Hh]ealth[ \t]?[Cc]ard(?:[ \t]?[Nn]umber)?|HCN|PHN|[Pp]atient[ \t]?[Ii][Dd])\b[ \t]*[:#=][ \t]*["']?([A-Za-z0-9-]{6,15})\b/g;

export const healthIdDetector: Detector = {
  id: 'health-identifier',
  name: 'Health identifier (labeled field)',
  category: 'personal',
  severity: 'high',
  label: 'HEALTH_ID',
  priority: 61,
  strictOnly: true,
  explanation: 'Medical record and health card numbers are protected health information.',
  detect: (text) =>
    regexMatches(text, HEALTH_ID_RE, {
      group: 1,
      confidenceFor: (value) => ((value.match(/\d/g)?.length ?? 0) >= 4 ? 'high' : null),
    }),
};
