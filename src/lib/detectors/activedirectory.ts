import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Active Directory distinguished names, e.g.
 *   CN=Users,DC=ad,DC=example,DC=test
 *   OU=Terminated Users,OU=Accounts,DC=example,DC=test
 *
 * Structure: zero or more leading RDNs (CN/OU/O/L/ST) whose values may contain
 * spaces, ending in at least two DC components restricted to domain-label
 * characters so the match stops cleanly at the end of the DN.
 * Escaped commas inside values (CN=Demo\, User) are not supported.
 */
const AD_DN_RE =
  /\b(?:(?:CN|OU|O|L|ST)=[^,;=\r\n]{1,64},\s*)*DC=[A-Za-z0-9-]{1,63}(?:,\s*DC=[A-Za-z0-9-]{1,63})+/gi;

export const adDnDetector: Detector = {
  id: 'ad-dn',
  name: 'AD distinguished name',
  category: 'infrastructure',
  severity: 'medium',
  label: 'AD_DN',
  priority: 85,
  explanation: 'Distinguished names reveal directory structure, OU names, and the AD domain.',
  detect: (text) => regexMatches(text, AD_DN_RE),
};
