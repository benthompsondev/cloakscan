import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * Credential-bearing connection strings. Two shapes:
 *
 * 1. URL style with embedded credentials: scheme://user:password@host/...
 *    Only URLs that actually carry user:password are flagged — a plain
 *    database URL without credentials is not a secret by itself.
 * 2. ADO/ODBC key-value style: Server=...;Database=...;User Id=...;Password=...
 *    Matched only when a Password/Pwd segment is present, and redacted as one
 *    unit so no fragment (host, user, database) survives.
 */
const URL_CREDENTIAL_RE =
  /\b(?:postgres(?:ql)?|mysql|mariadb|mongodb(?:\+srv)?|redis|rediss|amqps?|mssql|sqlserver|oracle|ftps?|sftp|ldaps?|https?):\/\/[^\s/:@"']+:[^\s@"']+@[^\s"'<>]+/gi;

/** Redis permits an empty username: redis://:password@host/db. */
const REDIS_PASSWORD_ONLY_RE = /\brediss?:\/\/:[^\s@"']+@[^\s"'<>]+/gi;

/** Literal basic-auth pairs in common command and SDK call shapes. */
const CURL_UNQUOTED_CREDENTIAL_RE =
  /\bcurl\b[^\r\n]{0,200}?(?:-u|--user)[ \t]+([^\s"']+:[^\s"']+)/gi;
const CURL_QUOTED_CREDENTIAL_RE =
  /\bcurl\b[^\r\n]{0,200}?(?:-u|--user)[ \t]+(["'])([^"'\r\n]+:[^"'\r\n]+)\1/gi;
const PYTHON_AUTH_TUPLE_RE =
  /\bauth[ \t]*=[ \t]*(\([ \t]*["'][^"'\r\n]+["'][ \t]*,[ \t]*["'][^"'\r\n]+["'][ \t]*\))/gi;
const BUFFER_BASIC_AUTH_RE =
  /\bBuffer\.from\([ \t]*(["'])([^"'\r\n]+:[^"'\r\n]+)\1[ \t]*\)\.toString\([ \t]*["']base64["'][ \t]*\)/gi;

/** `$USER`, `${CI_TOKEN}`, `%TOKEN%`, `$env:TOKEN` — a reference, not a literal. */
const RUNTIME_REFERENCE = String.raw`(?:\$\{[^}\r\n]*\}|\$(?:env:)?[A-Za-z_][A-Za-z0-9_]*|%[A-Za-z_][A-Za-z0-9_]*%)`;
const REFERENCE_PAIR_RE = new RegExp(`^${RUNTIME_REFERENCE}[:,]${RUNTIME_REFERENCE}$`);

function credentialPairConfidence(value: string): 'high' | null {
  const bare = value.replace(/[\s()"']/g, '');
  if (/^(?:user|username)(?::|,)(?:pass|password)$/.test(bare.toLowerCase())) return null;
  // sshpass and PSCredential already keep a `$VAR` reference intact. A pair
  // built only from references holds no literal credential either, so
  // redacting it just deletes the variable names from a documented command.
  return REFERENCE_PAIR_RE.test(bare) ? null : 'high';
}

const ADO_CONNECTION_RE =
  /\b(?:Data Source|Server|Host|Address|Initial Catalog|Database|User Id|User ID|Uid|User)[ \t]*=[ \t]*[^;\r\n]+;(?:[ \t]*[A-Za-z][A-Za-z ]*[ \t]*=[ \t]*[^;\r\n]+;)*?[ \t]*(?:Password|Pwd)[ \t]*=[ \t]*[^;\r\n"']+;?/gi;

export const connectionStringDetector: Detector = {
  id: 'connection-string',
  name: 'Connection string with credentials',
  category: 'secrets',
  severity: 'high',
  label: 'CONNECTION_STRING',
  // Above secret-assignment (80) and internal-url (75): the whole string wins
  // over the password fragment or hostname inside it.
  priority: 93,
  explanation: 'Connection strings with embedded credentials expose both the secret and the host.',
  detect: (text): RawMatch[] => [
    ...regexMatches(text, URL_CREDENTIAL_RE),
    ...regexMatches(text, REDIS_PASSWORD_ONLY_RE),
    ...regexMatches(text, CURL_UNQUOTED_CREDENTIAL_RE, {
      group: 1,
      confidenceFor: credentialPairConfidence,
    }),
    ...regexMatches(text, CURL_QUOTED_CREDENTIAL_RE, {
      group: 2,
      confidenceFor: credentialPairConfidence,
    }),
    ...regexMatches(text, PYTHON_AUTH_TUPLE_RE, {
      group: 1,
      confidenceFor: credentialPairConfidence,
    }),
    ...regexMatches(text, BUFFER_BASIC_AUTH_RE, {
      group: 2,
      confidenceFor: credentialPairConfidence,
    }),
    ...regexMatches(text, ADO_CONNECTION_RE),
  ],
};
