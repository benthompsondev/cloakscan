import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Usernames in clear labeled contexts only: "User: alex", "login=ademo".
 * Bare words are never guessed — context keeps false positives down.
 */
const USERNAME_RE =
  /(?<![A-Za-z0-9_])["']?(?:user(?:name)?|login|logon|account|samaccountname|userprincipalname|upn)["']?[ \t]*(?::=|=|:)[ \t]*["']?((?:[A-Za-z][A-Za-z0-9._-]{0,63}\\)?[A-Za-z][A-Za-z0-9._@-]{1,63})\b/gi;
const LOGIN_IS_DOMAIN_USER_RE =
  /\blogin[ \t]+is[ \t]+([A-Za-z][A-Za-z0-9._-]{0,63}\\[A-Za-z][A-Za-z0-9._@-]{1,63})\b/gi;
const PSCREDENTIAL_LITERAL_RE =
  /(?:\bNew-Object[ \t]+)?\[?(?:System\.Management\.Automation\.)?PSCredential\]?[ \t]*(?:\(|::new\()[ \t]*["']((?:[A-Za-z][A-Za-z0-9._-]{0,63}\\)?[A-Za-z][A-Za-z0-9._@-]{1,63})["'][ \t]*,/gi;
const AZURE_ACCOUNT_NAME_RE =
  /\bAccountName[ \t]*=[ \t]*([A-Za-z][A-Za-z0-9-]{2,23})\b/gi;

export const usernameDetector: Detector = {
  id: 'username',
  name: 'Username',
  category: 'personal',
  severity: 'low',
  label: 'USERNAME',
  priority: 50,
  explanation: 'Account names identify people and map to real login identities.',
  detect: (text) => [
    ...regexMatches(text, USERNAME_RE, { group: 1, confidenceFor: () => 'medium' }),
    ...regexMatches(text, LOGIN_IS_DOMAIN_USER_RE, {
      group: 1,
      confidenceFor: () => 'medium',
    }),
    ...regexMatches(text, PSCREDENTIAL_LITERAL_RE, {
      group: 1,
      confidenceFor: () => 'high',
    }),
    ...regexMatches(text, AZURE_ACCOUNT_NAME_RE, {
      group: 1,
      confidenceFor: () => 'high',
    }),
  ],
};
