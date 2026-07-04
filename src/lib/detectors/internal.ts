import type { Detector } from '../types';
import { regexMatches } from './helpers';
import { isValidIpv4 } from './network';

/** TLD suffixes that conventionally mark intranet / non-public hosts. */
const INTERNAL_SUFFIXES = ['local', 'internal', 'corp', 'lan', 'intranet', 'intra'];

const SUFFIX_ALTERNATION = INTERNAL_SUFFIXES.join('|');

/** True for RFC 1918 / link-local IPv4 addresses. */
export function isPrivateIpv4(host: string): boolean {
  if (!isValidIpv4(host)) return false;
  const [a, b] = host.split('.').map(Number);
  return (
    a === 10 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254)
  );
}

/** Extract the hostname from a matched URL without using the DOM URL parser. */
function hostOf(url: string): string {
  const afterScheme = url.replace(/^https?:\/\//i, '');
  return afterScheme.split(/[/:?#]/, 1)[0].toLowerCase();
}

/** True if a hostname looks non-public: internal suffix, single label, private IP, or a tenant domain. */
export function looksInternalHost(host: string): boolean {
  if (isPrivateIpv4(host)) return true;
  if (!host.includes('.')) return true; // e.g. http://intranet or http://buildbox
  if (host.endsWith('.onmicrosoft.com')) return true; // M365 tenant domain
  const suffix = host.slice(host.lastIndexOf('.') + 1);
  return INTERNAL_SUFFIXES.includes(suffix);
}

const URL_RE = /\bhttps?:\/\/[^\s"'<>)\]]+/gi;

export const internalUrlDetector: Detector = {
  id: 'internal-url',
  name: 'Internal URL',
  category: 'infrastructure',
  severity: 'medium',
  label: 'INTERNAL_URL',
  priority: 75,
  explanation: 'Intranet URLs expose internal services, routes, and naming conventions.',
  detect: (text) =>
    regexMatches(text, URL_RE, {
      // Public URLs are skipped entirely; only internal-looking hosts are flagged.
      confidenceFor: (value) => (looksInternalHost(hostOf(value)) ? 'high' : null),
    }),
};

/** Bare hostnames ending in an internal suffix, e.g. ws-144.example.internal. */
const INTERNAL_HOSTNAME_RE = new RegExp(
  String.raw`\b[a-z0-9](?:[a-z0-9-]{0,62})?(?:\.[a-z0-9](?:[a-z0-9-]{0,62})?)*\.(?:${SUFFIX_ALTERNATION})\b`,
  'gi',
);

/** M365 tenant domains, e.g. contoso.onmicrosoft.com or contoso.mail.onmicrosoft.com. */
const ONMICROSOFT_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.onmicrosoft\.com\b/gi;

export const internalHostnameDetector: Detector = {
  id: 'internal-hostname',
  name: 'Internal hostname',
  category: 'infrastructure',
  severity: 'medium',
  label: 'INTERNAL_HOST',
  priority: 60,
  explanation: 'Internal machine and tenant names reveal infrastructure that should stay private.',
  detect: (text) => [
    ...regexMatches(text, INTERNAL_HOSTNAME_RE),
    ...regexMatches(text, ONMICROSOFT_RE),
  ],
};
