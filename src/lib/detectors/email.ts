import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/** Standard email addresses, e.g. alex.demo@example.internal. */
const EMAIL_RE =
  /(?<![$A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+\b/g;

/**
 * PowerShell often builds an address from a variable plus a quoted suffix,
 * e.g. "$alias@example.org". Matching only @example.org keeps the variable
 * intact while still hiding the organization-identifying domain.
 */
const EMAIL_DOMAIN_FRAGMENT_RE =
  /@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+\b/g;

/** Explicit domain/suffix fields without a leading @. */
const LABELED_MAIL_DOMAIN_RE =
  /\b(?:email|mail|upn|user[ _-]?principal[ _-]?name|accepted|tenant)[ _-]?(?:domain|suffix)\b[ \t]*[:=][ \t]*["']?((?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,})\b/gi;

function overlaps(a: RawMatch, b: RawMatch): boolean {
  return a.start < b.end && b.start < a.end;
}

export const emailDetector: Detector = {
  id: 'email',
  name: 'Email address / domain',
  category: 'personal',
  severity: 'medium',
  label: 'EMAIL',
  priority: 70,
  explanation: 'Email addresses and mail-domain suffixes identify people and organizations.',
  detect: (text) => {
    const fullAddresses = regexMatches(text, EMAIL_RE);
    const domainFragments = regexMatches(text, EMAIL_DOMAIN_FRAGMENT_RE).filter(
      (fragment) => !fullAddresses.some((address) => overlaps(fragment, address)),
    );
    const labeledDomains = regexMatches(text, LABELED_MAIL_DOMAIN_RE, { group: 1 }).filter(
      (domain) =>
        !fullAddresses.some((address) => overlaps(domain, address)) &&
        !domainFragments.some((fragment) => overlaps(domain, fragment)),
    );
    return [...fullAddresses, ...domainFragments, ...labeledDomains].sort(
      (a, b) => a.start - b.start,
    );
  },
};
