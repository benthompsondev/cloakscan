import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * PowerShell-focused detectors for shapes common in real admin scripts.
 * Only literal values are flagged — variables ($cred) and expressions are
 * skipped, which keeps false positives down.
 */

/** ConvertTo-SecureString "literal" — a plaintext secret in the script. */
const SECURE_STRING_LITERAL_RE = /ConvertTo-SecureString\s+(?:-String\s+)?["']([^"'\r\n]{4,})["']/gi;

export const secureStringLiteralDetector: Detector = {
  id: 'secure-string-literal',
  name: 'SecureString literal',
  category: 'secrets',
  severity: 'high',
  label: 'SECRET',
  priority: 88,
  explanation: 'A plaintext secret passed to ConvertTo-SecureString is a hardcoded credential.',
  detect: (text) => regexMatches(text, SECURE_STRING_LITERAL_RE, { group: 1 }),
};

const ACCOUNT_LITERAL = String.raw`(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([A-Za-z][A-Za-z0-9._@-]{1,63}))`;
const EXPLICIT_ACCOUNT_PARAM_RE = new RegExp(
  String.raw`-(?:SamAccountName|UserPrincipalName|UserName)\s+${ACCOUNT_LITERAL}`,
  'gi',
);
const ACCOUNT_IDENTITY_COMMAND_RE = new RegExp(
  String.raw`\b(?:Get-ADUser|Set-ADUser|Remove-ADUser|Enable-ADAccount|Disable-ADAccount|Unlock-ADAccount|Set-ADAccountPassword|Get-Mailbox|Set-Mailbox|Remove-Mailbox)\b[^\r\n;|]*?-Identity\s+${ACCOUNT_LITERAL}`,
  'gi',
);

function accountParameterMatches(text: string, pattern: RegExp): RawMatch[] {
  const matches: RawMatch[] = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = match[1] ?? match[2] ?? match[3];
    if (!value || !/^[A-Za-z][A-Za-z0-9._@-]{1,63}$/.test(value)) continue;
    const offset = match[0].lastIndexOf(value);
    if (offset < 0) continue;
    const start = match.index + offset;
    matches.push({ start, end: start + value.length, value, confidence: 'medium' });
  }
  return matches;
}

export const psIdentityParamDetector: Detector = {
  id: 'ps-identity-param',
  name: 'PowerShell identity parameter',
  category: 'personal',
  severity: 'low',
  label: 'USERNAME',
  // Below email (70): when the literal is a full UPN/email the email detector
  // wins and redacts it as [EMAIL_n] instead.
  priority: 68,
  explanation: 'Literal account names in explicit user/account contexts map to real logins.',
  detect: (text) => [
    ...accountParameterMatches(text, EXPLICIT_ACCOUNT_PARAM_RE),
    ...accountParameterMatches(text, ACCOUNT_IDENTITY_COMMAND_RE),
  ],
};

/**
 * Literal host values passed to server-style parameters:
 * -Server dc01.example.test, -ComputerName "app01", -SmtpServer relay01.
 */
const SERVER_PARAM_RE =
  /-(?:Server|ComputerName|SmtpServer|DomainController|ConnectionServer)\s+["']?([A-Za-z0-9][A-Za-z0-9._-]{1,253})\b/gi;

export const psServerParamDetector: Detector = {
  id: 'ps-server-param',
  name: 'PowerShell server parameter',
  category: 'infrastructure',
  severity: 'medium',
  label: 'INTERNAL_HOST',
  priority: 68,
  explanation: 'Literal server names in admin cmdlets identify internal infrastructure.',
  detect: (text) =>
    regexMatches(text, SERVER_PARAM_RE, { group: 1, confidenceFor: () => 'medium' }),
};

const INFRASTRUCTURE_KEY_SUFFIXES = [
  'smtpserver',
  'connectionuri',
  'hostname',
  'endpoint',
  'server',
  'host',
  'domain',
  'fqdn',
  'uri',
  'url',
];
const QUOTED_ASSIGNMENT_RE =
  /(\$[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*|(?<![$\w])[A-Za-z_][A-Za-z0-9_]*)\s*=\s*(["'])([^"'\r\n]{2,})\2/g;

function infrastructureKey(key: string): boolean {
  const leaf = key.replace(/^\$/, '').split('.').at(-1)?.replace(/[_-]/g, '').toLowerCase() ?? '';
  return INFRASTRUCTURE_KEY_SUFFIXES.some((suffix) => leaf.endsWith(suffix));
}

function infrastructureValue(value: string): boolean {
  if (/^https?:\/\/[^\s]+$/i.test(value)) return true;
  return /^[A-Za-z0-9][A-Za-z0-9._-]*(?::\d{2,5})?(?:\/[^\s]*)?$/.test(value);
}

/**
 * Quoted values assigned to infrastructure-named variables or properties.
 * Context lets this catch organization-specific public-TLD hosts that a
 * generic "internal hostname" detector cannot identify safely.
 */
export const psInfrastructureAssignmentDetector: Detector = {
  id: 'ps-infrastructure-assignment',
  name: 'Contextual infrastructure value',
  category: 'infrastructure',
  severity: 'medium',
  label: 'INTERNAL_HOST',
  // Internal URLs remain the more specific finding when both detectors match.
  priority: 74,
  explanation: 'A literal assigned to a server, host, endpoint, URI, URL, domain, or FQDN setting.',
  detect: (text): RawMatch[] => {
    const matches: RawMatch[] = [];
    const re = new RegExp(QUOTED_ASSIGNMENT_RE.source, QUOTED_ASSIGNMENT_RE.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text)) !== null) {
      const [, key, , value] = match;
      if (!infrastructureKey(key) || !infrastructureValue(value)) continue;
      const offset = match[0].lastIndexOf(value);
      if (offset < 0) continue;
      const start = match.index + offset;
      matches.push({ start, end: start + value.length, value, confidence: 'medium' });
    }
    return matches;
  },
};
