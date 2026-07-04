import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Strict-profile detectors. These only fire on values sitting in explicitly
 * labeled fields — they never guess at arbitrary capitalized words or scan
 * free text for name-shaped phrases.
 */

/**
 * Person names in explicit fields: Name:, FullName=, DisplayName:, Owner:,
 * RequestedBy:, Manager:, Approver:, Contact:.
 * The value must look like a person name — two to four capitalized words —
 * which keeps single words, hostnames, and ALL-CAPS constants out.
 * Field keys match common casings only; hostname/username do not match
 * because "name" must start at a word boundary.
 * Matching is strictly same-line ([ \t] only): a label and its value can
 * never span, or absorb, a line boundary.
 */
const PERSON_NAME_RE =
  /\b(?:[Ff]ull[ _]?[Nn]ame|[Dd]isplay[ _]?[Nn]ame|[Nn]ame|[Oo]wner|[Rr]equested[ _]?[Bb]y|[Mm]anager|[Aa]pprover|[Cc]ontact)\b[ \t]*[:=][ \t]*["']?([A-Z][a-z]+(?:[ '-][A-Z][A-Za-z'-]*){1,3})\b/g;

export const personNameDetector: Detector = {
  id: 'person-name',
  name: 'Person name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'NAME',
  priority: 52,
  strictOnly: true,
  explanation: 'A person name in an explicit Name/Owner/RequestedBy-style field.',
  detect: (text) => regexMatches(text, PERSON_NAME_RE, { group: 1, confidenceFor: () => 'medium' }),
};

/**
 * Organization names in explicit fields: Company:, CompanyName=,
 * Organization:, TenantName:, Employer:. The key is unambiguous, so a single
 * capitalized word is accepted (e.g. Company: Contoso).
 */
const ORG_NAME_RE =
  /\b(?:[Cc]ompany[ _]?[Nn]ame|[Cc]ompany|[Oo]rgani[sz]ation|[Oo]rg[ _]?[Nn]ame|[Tt]enant[ _]?[Nn]ame|[Ee]mployer)\b[ \t]*[:=][ \t]*["']?([A-Z][A-Za-z0-9&.'-]*(?:[ \t]+(?:&|[A-Z0-9][A-Za-z0-9&.'-]*)){0,5})\b/g;

export const orgNameDetector: Detector = {
  id: 'org-name',
  name: 'Organization name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'ORG',
  priority: 51,
  strictOnly: true,
  explanation: 'An organization name in an explicit Company/Organization/TenantName-style field.',
  detect: (text) => regexMatches(text, ORG_NAME_RE, { group: 1, confidenceFor: () => 'medium' }),
};
