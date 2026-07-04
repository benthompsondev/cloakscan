import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Usernames in clear labeled contexts only: "User: alex", "login=ademo".
 * Bare words are never guessed — context keeps false positives down.
 */
const USERNAME_RE =
  /\b(?:user(?:name)?|login|logon|account|samaccountname|userprincipalname|upn)\b\s*[:=]\s*["']?([A-Za-z][A-Za-z0-9._@-]{1,63})\b/gi;

export const usernameDetector: Detector = {
  id: 'username',
  name: 'Username',
  category: 'personal',
  severity: 'low',
  label: 'USERNAME',
  priority: 50,
  explanation: 'Account names identify people and map to real login identities.',
  detect: (text) => regexMatches(text, USERNAME_RE, { group: 1, confidenceFor: () => 'medium' }),
};
