import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * IT automation review leads: organization and workflow fingerprints that
 * show up in real PowerShell automation — AD group names, directory
 * attributes, Exchange and credential workflow terms, author initials in
 * history blocks, scheduled-job state files, CSV identity headers.
 *
 * Except for AD group names (a real org value worth redacting), these are
 * REVIEW LEADS, not confirmed secrets: the detectors are marked reviewLead,
 * so their findings start disabled and never silently rewrite output. They
 * exist to point a reviewer at lines worth a second look before a script
 * goes public.
 */

// --------------------------------------------------------------- AD groups --

const AD_GROUP_PATTERNS = [
  // Add-ADGroupMember -Identity "GroupName" / Remove-/Get-ADGroupMember
  /\b(?:Add|Remove|Get)-ADGroupMember\b[^\r\n|;]*?-Identity\s+(['"])([^'"\r\n]{2,80})\1/gi,
  // -MemberOf "GroupName" (Add-ADPrincipalGroupMembership and friends)
  /-MemberOf\s+(['"])([^'"\r\n]{2,80})\1/gi,
  // New-ADGroup -Name "GroupName"
  /\bNew-ADGroup\b[^\r\n|;]*?-Name\s+(['"])([^'"\r\n]{2,80})\1/gi,
];

function captureGroupValues(text: string, patterns: RegExp[], group = 2): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns) {
    const re = new RegExp(pattern.source, pattern.flags);
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const value = m[group];
      if (!value) continue;
      const offset = m[0].lastIndexOf(value);
      if (offset < 0) continue;
      const start = m.index + offset;
      matches.push({ start, end: start + value.length, value, confidence: 'high' });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  return matches;
}

export const adGroupNameDetector: Detector = {
  id: 'ad-group-name',
  name: 'AD group name',
  category: 'directory',
  severity: 'medium',
  label: 'AD_GROUP',
  priority: 66,
  explanation:
    'Group names in AD membership commands reveal access, license, and application groups.',
  detect: (text) => captureGroupValues(text, AD_GROUP_PATTERNS),
};

// ---------------------------------------------------- directory attributes --

// Distinctive attribute names can match on a word boundary; `mail` and
// `Enabled` are ordinary words, so they need exact case plus a code-ish
// prefix character to count.
const DIR_ATTRIBUTE_RE =
  /\b(?:SamAccountName|UserPrincipalName|DistinguishedName|CanonicalName|DisplayName|otherTelephone|otherIpPhone|otherFacsimileTelephoneNumber|pwdLastSet|ProxyAddresses)\b/gi;
const DIR_COMMON_WORD_RE = /(?<=[.$'"-])(?:mail|Enabled)\b/g;

export const directoryAttributeDetector: Detector = {
  id: 'directory-attribute',
  name: 'Directory attribute',
  category: 'directory',
  severity: 'low',
  label: 'DIR_ATTRIBUTE',
  priority: 34,
  reviewLead: true,
  explanation:
    'Directory attribute names are usually safe, but the values next to them often are not — review the line.',
  detect: (text) => [
    ...regexMatches(text, DIR_ATTRIBUTE_RE, { confidenceFor: () => 'low' }),
    ...regexMatches(text, DIR_COMMON_WORD_RE, { confidenceFor: () => 'low' }),
  ],
};

// ------------------------------------------------------- Exchange workflow --

const EXCHANGE_TERM_RE =
  /\b(?:Get-Recipient|RecipientTypeDetails|RemoteUserMailbox|RemoteSharedMailbox|UserMailbox|SharedMailbox|Enable-RemoteMailbox|RemoteRoutingAddress|Import-PSSession)\b/gi;
const EXCHANGE_SESSION_RE =
  /\bNew-PSSession\b[^\r\n|;]*?-ConfigurationName\s+Microsoft\.Exchange\b/gi;

export const exchangeWorkflowDetector: Detector = {
  id: 'exchange-workflow',
  name: 'Exchange workflow term',
  category: 'messaging',
  severity: 'low',
  label: 'EXCHANGE_TERM',
  priority: 33,
  reviewLead: true,
  explanation:
    'Exchange cmdlets and recipient types outline your mailbox architecture — check nearby lines for tenant and routing details.',
  detect: (text) => [
    ...regexMatches(text, EXCHANGE_TERM_RE, { confidenceFor: () => 'low' }),
    ...regexMatches(text, EXCHANGE_SESSION_RE, { confidenceFor: () => 'medium' }),
  ],
};

// ----------------------------------------------------- credential workflow --

const CREDENTIAL_TERM_RE =
  /\b(?:Export-Clixml|Import-Clixml|PSCredential|Send-MailMessage|InitializeSmtpCredential|SmtpCredentialPath|DefaultSmtpUsername)\b/gi;

export const credentialWorkflowDetector: Detector = {
  id: 'credential-workflow',
  name: 'Credential workflow term',
  category: 'workflow',
  severity: 'low',
  label: 'CRED_WORKFLOW',
  priority: 32,
  reviewLead: true,
  explanation:
    'Credential handling commands mark where secrets are stored or sent — review the paths, usernames, and servers around them.',
  detect: (text) => regexMatches(text, CREDENTIAL_TERM_RE, { confidenceFor: () => 'low' }),
};

// -------------------------------------------------------- author initials --

const HISTORY_LINE_RE =
  /^[ \t]*#[^\r\n]*\b(?:Author|Modified|Created|Updated|Revision|Rev|History|Changed)\b[^\r\n]*/gim;
const INITIALS_RE = /(?<![A-Za-z0-9])([A-Z]{2,3})(?![A-Za-z0-9])/g;
/** Common acronyms that are not people. */
const INITIALS_STOPLIST = new Set([
  'AD', 'AND', 'API', 'CSV', 'DB', 'DC', 'DEV', 'DNS', 'FIX', 'HR', 'ID', 'IIS', 'IP', 'IT',
  'LOG', 'NEW', 'NOT', 'OLD', 'OU', 'PC', 'PS', 'QA', 'SQL', 'SMTP', 'TODO', 'UAT', 'UI',
  'UPN', 'URL', 'USB', 'VM', 'VPN', 'WIP', 'XML',
]);

export const authorInitialsDetector: Detector = {
  id: 'author-initials',
  name: 'Author initials in history block',
  category: 'personal',
  severity: 'low',
  label: 'INITIALS',
  priority: 31,
  reviewLead: true,
  explanation:
    'Initials in script headers and change history can identify coworkers — decide whether they should ship.',
  detect: (text): RawMatch[] => {
    const matches: RawMatch[] = [];
    const lineRe = new RegExp(HISTORY_LINE_RE.source, HISTORY_LINE_RE.flags);
    let line: RegExpExecArray | null;
    while ((line = lineRe.exec(text)) !== null) {
      const initialsRe = new RegExp(INITIALS_RE.source, INITIALS_RE.flags);
      let hit: RegExpExecArray | null;
      while ((hit = initialsRe.exec(line[0])) !== null) {
        if (INITIALS_STOPLIST.has(hit[1])) continue;
        const start = line.index + hit.index;
        matches.push({ start, end: start + hit[1].length, value: hit[1], confidence: 'low' });
      }
    }
    return matches;
  },
};

// ------------------------------------------------------ workflow artifacts --

const WORKFLOW_ARTIFACT_RE =
  /\b[A-Za-z0-9_-]*(?:cycle_state|run_state|last_run|runstamp|run_stamp|audit|snapshot)[A-Za-z0-9_-]*\.(?:json|xml|csv|log|txt)\b/gi;
const CLIXML_FILE_RE = /\b[A-Za-z0-9_-]{2,}\.clixml\b/gi;

export const workflowArtifactDetector: Detector = {
  id: 'workflow-artifact',
  name: 'Scheduled workflow artifact',
  category: 'workflow',
  severity: 'low',
  label: 'WORKFLOW_FILE',
  priority: 35,
  reviewLead: true,
  explanation:
    'State files, audit logs, snapshots, and stored credential files describe how your scheduled jobs run.',
  detect: (text) => [
    ...regexMatches(text, WORKFLOW_ARTIFACT_RE, { confidenceFor: () => 'medium' }),
    ...regexMatches(text, CLIXML_FILE_RE, { confidenceFor: () => 'medium' }),
  ],
};

// ---------------------------------------------------- CSV identity headers --

const CSV_IDENTITY_FIELDS = [
  'employee id', 'employeeid', 'ad username', 'adusername', 'username', 'upn',
  'userprincipalname', 'samaccountname', 'email', 'e-mail', 'first name', 'firstname',
  'last name', 'lastname', 'display name', 'displayname', 'access id', 'accessid',
  'access password', 'activation date', 'deactivation date', 'status', 'comments',
];

export const csvIdentityHeaderDetector: Detector = {
  id: 'csv-identity-header',
  name: 'CSV identity schema',
  category: 'workflow',
  severity: 'low',
  label: 'CSV_SCHEMA',
  priority: 30,
  reviewLead: true,
  explanation:
    'This line looks like an identity CSV header — the export it describes (and any sample rows) is the sensitive part.',
  detect: (text): RawMatch[] => {
    const matches: RawMatch[] = [];
    let lineStart = 0;
    for (const rawLine of text.split('\n')) {
      const line = rawLine.replace(/\r$/, '');
      // Only comma-separated header-looking lines are candidates.
      if ((line.match(/,/g)?.length ?? 0) >= 2) {
        const cells = line
          .split(',')
          .map((cell) => cell.trim().replace(/^["']|["']$/g, '').toLowerCase());
        const hits = new Set(cells.filter((cell) => CSV_IDENTITY_FIELDS.includes(cell)));
        if (hits.size >= 3) {
          const value = line.trimEnd();
          matches.push({
            start: lineStart,
            end: lineStart + value.length,
            value,
            confidence: hits.size >= 4 ? 'medium' : 'low',
          });
        }
      }
      lineStart += rawLine.length + 1;
    }
    return matches;
  },
};
