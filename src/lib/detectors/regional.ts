import type { Detector, RawMatch } from '../types';

/**
 * Pack-only regional detectors (Canada, United States, EU Common). None of
 * them run under the Balanced or Strict Core modes alone — a policy pack (or
 * an explicit rule override) has to enable them.
 *
 * Shared discipline: strictly line-based scanning. Context labels and their
 * values live on one line and can never cross or absorb a CR/LF boundary.
 */

/** Run a per-line matcher only on lines that satisfy a context test. */
function scanLines(
  text: string,
  lineHasContext: (line: string) => boolean,
  findInLine: (line: string, lineStart: number) => RawMatch[],
): RawMatch[] {
  const matches: RawMatch[] = [];
  let lineStart = 0;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (lineHasContext(line)) matches.push(...findInLine(line, lineStart));
    lineStart += rawLine.length + 1; // + '\n'
  }
  return matches;
}

function execAll(line: string, lineStart: number, re: RegExp, confidence: RawMatch['confidence']) {
  const matches: RawMatch[] = [];
  const clone = new RegExp(re.source, re.flags);
  let m: RegExpExecArray | null;
  while ((m = clone.exec(line)) !== null) {
    matches.push({
      start: lineStart + m.index,
      end: lineStart + m.index + m[0].length,
      value: m[0],
      confidence,
    });
  }
  return matches;
}

// ---------------------------------------------------------------- Canada ---

/**
 * Canadian postal codes: A1A 1A1 (spaced or compact). Letter restrictions:
 * D, F, I, O, Q, U never appear; W and Z never appear in the first position.
 * Context required — the line must carry a PostalCode/ZIP/Address-style
 * label, so arbitrary standalone letter-digit triples are never flagged.
 */
const POSTAL_CONTEXT_RE =
  /\b(?:Postal[ _]?Code|ZIP(?:[ _]?Code)?|Address|Street|Mailing[ _]?Address|Home[ _]?Address|City|Location)\b[ \t]*[:=]/i;
const CA_POSTAL_RE = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ ]?\d[ABCEGHJ-NPRSTV-Z]\d\b/g;

export const caPostalCodeDetector: Detector = {
  id: 'ca-postal-code',
  name: 'Canadian postal code',
  category: 'personal',
  severity: 'medium',
  label: 'POSTAL_CODE',
  // Below physical-address (54): when the address rule captures the whole
  // line value, the postal code inside it is covered by that finding.
  priority: 53,
  packOnly: true,
  explanation: 'Postal codes narrow a person to a block or building.',
  detect: (text) =>
    scanLines(
      text,
      (line) => POSTAL_CONTEXT_RE.test(line),
      (line, start) => execAll(line, start, CA_POSTAL_RE, 'high'),
    ),
};

// ----------------------------------------------------------- United States ---

/**
 * US Social Security Numbers. Issued-range restrictions: area not 000, 666,
 * or 900-999; group not 00; serial not 0000.
 * - Labeled (SSN:, Social Security Number =): any grouping, high confidence.
 * - Unlabeled: only the canonical 123-45-6789 dashed shape, medium confidence.
 * Bare nine-digit runs are never flagged.
 */
export function isValidSsn(value: string): boolean {
  const digits = value.replace(/[ -]/g, '');
  if (!/^\d{9}$/.test(digits)) return false;
  const area = digits.slice(0, 3);
  const group = digits.slice(3, 5);
  const serial = digits.slice(5);
  if (area === '000' || area === '666' || area[0] === '9') return false;
  if (group === '00' || serial === '0000') return false;
  return true;
}

const SSN_LABELED_LINE_RE =
  /\b(?:SSN|Social[ \t]?Security(?:[ \t]?(?:Number|No))?|Soc[ \t]?Sec)\b[ \t]*[:#=][ \t]*["']?(\d{3}[ -]?\d{2}[ -]?\d{4})(?![\d-])/gi;
const SSN_GROUPED_RE = /(?<![\d-])\d{3}-\d{2}-\d{4}(?![\d-])/g;

export const usSsnDetector: Detector = {
  id: 'us-ssn',
  name: 'US Social Security Number',
  category: 'personal',
  severity: 'high',
  label: 'SSN',
  priority: 63,
  packOnly: true,
  explanation: 'SSNs enable identity theft and are legally protected.',
  detect: (text): RawMatch[] => {
    const labeled: RawMatch[] = [];
    const re = new RegExp(SSN_LABELED_LINE_RE.source, SSN_LABELED_LINE_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[1];
      if (!isValidSsn(value)) continue;
      const start = m.index + m[0].lastIndexOf(value);
      labeled.push({ start, end: start + value.length, value, confidence: 'high' });
    }
    const grouped: RawMatch[] = [];
    const gre = new RegExp(SSN_GROUPED_RE.source, SSN_GROUPED_RE.flags);
    while ((m = gre.exec(text)) !== null) {
      if (!isValidSsn(m[0])) continue;
      grouped.push({ start: m.index, end: m.index + m[0].length, value: m[0], confidence: 'medium' });
    }
    return [...labeled, ...grouped];
  },
};

/**
 * US ZIP codes: 12345 or 12345-6789, only on lines with ZIP/postal/address
 * context. Arbitrary five-digit numbers are never flagged.
 */
const ZIP_CONTEXT_RE =
  /\b(?:ZIP(?:[ _]?Code)?|Postal[ _]?Code|Address|Street|Mailing[ _]?Address|City|State)\b[ \t]*[:=]/i;
const US_ZIP_RE = /(?<![\d-])\d{5}(?:-\d{4})?(?![\d-])/g;

export const usZipDetector: Detector = {
  id: 'us-zip',
  name: 'US ZIP code',
  category: 'personal',
  severity: 'low',
  label: 'ZIP',
  priority: 52, // below physical-address, like the Canadian postal code
  packOnly: true,
  explanation: 'ZIP codes narrow a person to a small area.',
  detect: (text) =>
    scanLines(
      text,
      (line) => ZIP_CONTEXT_RE.test(line),
      (line, start) => execAll(line, start, US_ZIP_RE, 'medium'),
    ),
};

// ------------------------------------------------------------------- EU ---

/** IBAN registry: country code -> exact length (common SEPA countries). */
const IBAN_LENGTHS: Record<string, number> = {
  AT: 20, BE: 16, BG: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IS: 26,
  IT: 27, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15,
  PL: 28, PT: 25, RO: 24, SE: 24, SI: 19, SK: 24,
};

/**
 * ISO 13616 MOD-97 check: move the first four chars to the end, letters →
 * 10..35, mod 97 === 1. Case is normalized here for validation only — the
 * finding always preserves the exact characters that appeared in the source.
 */
export function isValidIban(raw: string): boolean {
  const compact = raw.toUpperCase();
  const country = compact.slice(0, 2);
  const expected = IBAN_LENGTHS[country];
  if (!expected || compact.length !== expected) return false;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(compact)) return false;
  const rearranged = compact.slice(4) + compact.slice(0, 4);
  let remainder = 0;
  for (const char of rearranged) {
    const part = char >= 'A' ? String(char.charCodeAt(0) - 55) : char;
    for (const digit of part) remainder = (remainder * 10 + Number(digit)) % 97;
  }
  return remainder === 1;
}

/**
 * Broad token-run candidate; validation trims trailing tokens until it checks
 * out. Upper, lower, and mixed case are all accepted — the checksum and
 * country-length registry do the real filtering.
 */
const IBAN_CANDIDATE_RE = /(?<![A-Za-z0-9])[A-Za-z]{2}\d{2}(?: ?[A-Za-z0-9]{1,4})+(?![A-Za-z0-9])/g;

export const ibanDetector: Detector = {
  id: 'iban',
  name: 'IBAN',
  category: 'personal',
  severity: 'high',
  label: 'IBAN',
  // Above payment-card (84): the digit groups inside an IBAN must never be
  // partially claimed as a card number.
  priority: 91,
  packOnly: true,
  explanation: 'IBANs identify personal bank accounts.',
  detect: (text): RawMatch[] => {
    const matches: RawMatch[] = [];
    const re = new RegExp(IBAN_CANDIDATE_RE.source, IBAN_CANDIDATE_RE.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      // A following word can get swallowed by the candidate run; trim
      // whitespace-separated tokens from the end until the checksum passes.
      const tokens = m[0].split(' ');
      for (let keep = tokens.length; keep >= 1; keep -= 1) {
        const candidate = tokens.slice(0, keep).join(' ');
        const compact = candidate.replace(/ /g, '');
        if (compact.length < 15) break;
        if (isValidIban(compact)) {
          matches.push({
            start: m.index,
            end: m.index + candidate.length,
            value: candidate,
            confidence: 'high',
          });
          break;
        }
      }
    }
    return matches;
  },
};
