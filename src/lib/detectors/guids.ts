import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

const GUID_PATTERN = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';

/**
 * GUIDs labeled with a cloud/directory identifier key, e.g.
 * TenantId: <guid>, $ClientId = "<guid>", subscription_id=<guid>.
 * These are org-identifying (Entra tenant, app registration, subscription).
 */
const LABELED_GUID_RE = new RegExp(
  String.raw`\b[A-Za-z0-9_.-]*(?:tenant|client|object|subscription|application|app|directory|resource|user|account|principal)[-_ ]?id\b\s*[:=]\s*["']?(${GUID_PATTERN})\b`,
  'gi',
);

/** Any other GUID. Inherently an identifier, but context is unknown → low confidence. */
const BARE_GUID_RE = new RegExp(String.raw`\b${GUID_PATTERN}\b`, 'g');

export const guidDetector: Detector = {
  id: 'guid-identifier',
  name: 'GUID identifier',
  category: 'infrastructure',
  severity: 'medium',
  label: 'GUID',
  priority: 82,
  explanation:
    'GUIDs identify tenants, apps, subscriptions, directory objects, or service accounts.',
  detect: (text): RawMatch[] => {
    const labeled = regexMatches(text, LABELED_GUID_RE, { group: 1 });
    // Bare GUIDs at low confidence; overlap resolution in scan.ts keeps the
    // labeled (higher-confidence) match when both hit the same GUID.
    const bare = regexMatches(text, BARE_GUID_RE, { confidenceFor: () => 'low' });
    return [...labeled, ...bare];
  },
};
