import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Candidate runs of hex digits and colons, bounded so we never start or end
 * inside a word, number, IPv4 address, or another colon-run (this keeps
 * timestamps like 09:42:11, MAC addresses, and PowerShell :: member access
 * out of the candidate pool — they then also fail strict validation).
 */
const IPV6_CANDIDATE_RE = /(?<![0-9A-Za-z:.])[0-9A-Fa-f:]{2,45}(?![0-9A-Za-z:.])/g;

/** Strict IPv6 validation including compressed (::) forms. */
export function isValidIpv6(value: string): boolean {
  if (!value.includes(':')) return false;
  if (value.includes(':::')) return false;
  const halves = value.split('::');
  if (halves.length > 2) return false;
  const groupsOf = (part: string) => (part === '' ? [] : part.split(':'));
  const groups = [...groupsOf(halves[0]), ...(halves.length === 2 ? groupsOf(halves[1]) : [])];
  if (groups.some((g) => !/^[0-9A-Fa-f]{1,4}$/.test(g))) return false;
  // '::' must compress at least one group; uncompressed needs exactly eight.
  return halves.length === 2 ? groups.length <= 7 : groups.length === 8;
}

/** Loopback/unspecified are flagged but rarely sensitive. */
const WELL_KNOWN = new Set(['::', '::1']);

export const ipv6Detector: Detector = {
  id: 'ipv6',
  name: 'IPv6 address',
  category: 'infrastructure',
  severity: 'medium',
  label: 'IP_ADDRESS',
  priority: 66,
  explanation: 'IPv6 addresses can expose internal network layout or reachable hosts.',
  detect: (text) =>
    regexMatches(text, IPV6_CANDIDATE_RE, {
      confidenceFor: (value) => {
        if (!isValidIpv6(value)) return null;
        return WELL_KNOWN.has(value) ? 'low' : 'high';
      },
    }),
};
