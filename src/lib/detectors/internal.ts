import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';
import { isValidIpv4 } from './network';
import { detectionView } from '../detectionView';

/** TLD or zone labels that conventionally mark intranet / non-public hosts. */
const INTERNAL_SUFFIXES = ['local', 'internal', 'corp', 'lan', 'intranet', 'intra', 'lab'];
const AD_ZONE_LABELS = ['ad', 'ds'];
const ANY_POSITION_INTERNAL_LABELS = [...INTERNAL_SUFFIXES, ...AD_ZONE_LABELS];

const WINDOWS_SERVER_LABEL_RE = /^(?:[a-z]+[0-9]{1,4}|[a-z]{2,8}-[a-z0-9]*[0-9][a-z0-9-]*)$/i;

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
  const comparable = detectionView(url)?.text ?? url;
  const afterScheme = comparable.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const authority = afterScheme.split(/[/?#]/, 1)[0];
  const withoutUserInfo = authority.slice(authority.lastIndexOf('@') + 1);
  return withoutUserInfo.split(':', 1)[0].toLowerCase();
}

/** True if a hostname looks non-public: internal zone labels, single label, private IP, or a tenant domain. */
export function looksInternalHost(host: string): boolean {
  const normalized = host.toLocaleLowerCase();
  if (isPrivateIpv4(normalized)) return true;
  if (!normalized.includes('.')) return true; // e.g. http://intranet or http://buildbox
  if (normalized.endsWith('.onmicrosoft.com')) return true; // M365 tenant domain
  const labels = normalized.split('.').filter(Boolean);
  const suffix = labels.at(-1) ?? '';
  if (INTERNAL_SUFFIXES.includes(suffix)) return true;
  const first = labels[0] ?? '';
  const hasInternalLabel = labels.some((label) => INTERNAL_SUFFIXES.includes(label));
  if (hasInternalLabel) return true;
  const hasAdZoneLabel = labels.some((label, index) => index > 0 && AD_ZONE_LABELS.includes(label));
  return hasAdZoneLabel && WINDOWS_SERVER_LABEL_RE.test(first);
}

// A pasted BOM must not truncate a public hostname into a single-label host.
const URL_RE = /\b(?:https?|ldaps?):\/\/(?:\ufeff|[^\s"'<>\]])+/gi;

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
    }).map((match) => {
      // Parentheses are legal within a path. Only trim unmatched closing
      // parentheses belonging to surrounding prose or Markdown.
      let value = match.value;
      let extraClosers = (value.match(/\)/g)?.length ?? 0) - (value.match(/\(/g)?.length ?? 0);
      while (extraClosers > 0 && value.endsWith(')')) {
        value = value.slice(0, -1);
        extraClosers -= 1;
      }
      return { ...match, value, end: match.start + value.length };
    }),
};

/** Bare multi-label hostnames; filtered through looksInternalHost to avoid public domains. */
const HOSTNAME_RE = /\b[a-z0-9](?:[a-z0-9-]{0,62})?(?:\.[a-z0-9](?:[a-z0-9-]{0,62})?){1,}\b/gi;

/** M365 tenant domains, e.g. contoso.onmicrosoft.com or contoso.mail.onmicrosoft.com. */
const ONMICROSOFT_RE = /\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.onmicrosoft\.com\b/gi;
const LABELED_HOST_RE =
  /(?<![A-Za-z0-9_])(?:host|hostname|server)[ \t]*(?:=|:)[ \t]*["']?([A-Za-z0-9][A-Za-z0-9._-]{1,253})\b/gi;
const CMDKEY_TARGET_RE = /\bcmdkey\b[^\r\n]{0,200}?[ \t]\/add:([A-Za-z0-9][A-Za-z0-9._-]{1,253})\b/gi;
const AZURE_SERVICE_ENDPOINT_HOST_RE =
  /\bEndpoint[ \t]*=[ \t]*sb:\/\/([A-Za-z0-9][A-Za-z0-9.-]{1,253})\b/gi;

function contextualHostConfidence(value: string): 'high' | null {
  return /[.\d-]/.test(value) ? 'high' : null;
}

export const internalHostnameDetector: Detector = {
  id: 'internal-hostname',
  name: 'Internal hostname',
  category: 'infrastructure',
  severity: 'medium',
  label: 'INTERNAL_HOST',
  priority: 60,
  explanation: 'Internal machine and tenant names reveal infrastructure that should stay private.',
  detect: (text) => {
    const matches = [
      ...regexMatches(text, HOSTNAME_RE, {
        confidenceFor: (value) => {
          if (isValidIpv4(value)) return null;
          if (!looksInternalHost(value)) return null;
          return ANY_POSITION_INTERNAL_LABELS.some((label) =>
            value.toLocaleLowerCase().split('.').includes(label),
          )
            ? 'high'
            : 'medium';
        },
      }),
      ...regexMatches(text, ONMICROSOFT_RE),
      ...regexMatches(text, LABELED_HOST_RE, {
        group: 1,
        confidenceFor: contextualHostConfidence,
      }),
      ...regexMatches(text, CMDKEY_TARGET_RE, {
        group: 1,
        confidenceFor: () => 'high',
      }),
      ...regexMatches(text, AZURE_SERVICE_ENDPOINT_HOST_RE, {
        group: 1,
        confidenceFor: () => 'high',
      }),
    ];
    const seen = new Set<string>();
    return matches.filter((match: RawMatch) => {
      const key = `${match.start}:${match.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  },
};
