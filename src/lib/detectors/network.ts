import type { Detector } from '../types';

/** Dotted-quad candidates; octet range is validated separately for readability. */
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

const VERSION_CUE_RE =
  /(?:\b(?:v|version|ver|rev|build|release|assembly|fileversion|assemblyversion)|\b[a-z][a-z0-9_-]*version)(?:[ \t"'(=:>+]|\[){0,16}$/iu;

export function isValidIpv4(value: string): boolean {
  return value.split('.').every((octet) => {
    if (octet.length > 1 && octet.startsWith('0')) return false;
    const n = Number(octet);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

function isVersionContext(text: string, start: number, end: number): boolean {
  // A valid-looking quad inside 1.2.3.4.5 is still a version, not an address.
  if (
    (text[start - 1] === '.' && /\d/u.test(text[start - 2] ?? '')) ||
    (text[end] === '.' && /\d/u.test(text[end + 1] ?? ''))
  ) {
    return true;
  }
  const lineStart = Math.max(text.lastIndexOf('\n', start - 1), text.lastIndexOf('\r', start - 1)) + 1;
  return VERSION_CUE_RE.test(text.slice(lineStart, start));
}

function isNonSensitiveSpecialAddress(value: string): boolean {
  return (
    value.startsWith('127.') ||
    value === '0.0.0.0' ||
    value === '255.255.255.255'
  );
}

export const ipv4Detector: Detector = {
  id: 'ipv4',
  name: 'IPv4 address',
  category: 'infrastructure',
  severity: 'medium',
  label: 'IP_ADDRESS',
  priority: 65,
  explanation: 'IP addresses can expose internal network layout or reachable hosts.',
  detect: (text) => {
    const matches = [];
    const re = new RegExp(IPV4_RE.source, IPV4_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const value = match[0];
      const start = match.index;
      const end = start + value.length;
      if (!isValidIpv4(value)) continue;
      if (isNonSensitiveSpecialAddress(value) || isVersionContext(text, start, end)) continue;
      matches.push({ start, end, value, confidence: 'high' as const });
    }
    return matches;
  },
};
