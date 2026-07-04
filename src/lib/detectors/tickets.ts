import type { Detector } from '../types';
import { regexMatches } from './helpers';

/** ServiceNow-style ticket numbers: INC104892, CHG543210, RITM0012345... */
const SERVICENOW_RE = /\b(?:INC|CHG|REQ|RITM|PRB|SCTASK|TASK)\d{5,}\b/g;

/**
 * Jira-style keys: OPS-2214, PLAT-104. Prefixes are letters only and issue
 * numbers need at least two digits, preventing regex fragments such as Z0-9.
 */
const JIRA_RE = /\b[A-Z]{2,10}-\d{2,6}\b/g;

/** Common acronym-number pairs that look like Jira keys but are not tickets. */
const JIRA_FALSE_POSITIVES = new Set(['UTF', 'ISO', 'RFC', 'CVE', 'SHA', 'MD', 'TLS', 'HTTP', 'IPV', 'X']);

export const ticketIdDetector: Detector = {
  id: 'ticket-id',
  name: 'Ticket / issue ID',
  category: 'infrastructure',
  severity: 'low',
  label: 'TICKET_ID',
  priority: 55,
  explanation: 'Ticket numbers link shared text back to internal systems and incidents.',
  detect: (text) => [
    ...regexMatches(text, SERVICENOW_RE),
    ...regexMatches(text, JIRA_RE, {
      confidenceFor: (value) => {
        const prefix = value.slice(0, value.indexOf('-'));
        return JIRA_FALSE_POSITIVES.has(prefix) ? null : 'medium';
      },
    }),
  ],
};
