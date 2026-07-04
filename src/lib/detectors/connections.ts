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
    ...regexMatches(text, ADO_CONNECTION_RE),
  ],
};
