import type { Detector } from '../types';
import { regexMatches } from './helpers';

/** Dotted-quad candidates; octet range is validated separately for readability. */
const IPV4_RE = /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g;

/** Loopback/unspecified addresses are flagged but rarely sensitive. */
const WELL_KNOWN = new Set(['127.0.0.1', '0.0.0.0']);

export function isValidIpv4(value: string): boolean {
  return value.split('.').every((octet) => {
    if (octet.length > 1 && octet.startsWith('0')) return false;
    const n = Number(octet);
    return Number.isInteger(n) && n >= 0 && n <= 255;
  });
}

export const ipv4Detector: Detector = {
  id: 'ipv4',
  name: 'IPv4 address',
  category: 'infrastructure',
  severity: 'medium',
  label: 'IP_ADDRESS',
  priority: 65,
  explanation: 'IP addresses can expose internal network layout or reachable hosts.',
  detect: (text) =>
    regexMatches(text, IPV4_RE, {
      confidenceFor: (value) => {
        if (!isValidIpv4(value)) return null; // e.g. 999.1.1.1 or a version string
        return WELL_KNOWN.has(value) ? 'low' : 'high';
      },
    }),
};
