import { describe, expect, it } from 'vitest';
import { personNameDetector, orgNameDetector } from './strict';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';
import { enabledRuleIds, profileRuleStates } from '../profiles';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

const strictIds = enabledRuleIds(profileRuleStates('strict'));

describe('person name detector (strict)', () => {
  it('finds names in explicitly labeled fields', () => {
    expect(values(personNameDetector, 'RequestedBy: Alex Morgan-Demo')).toEqual([
      'Alex Morgan-Demo',
    ]);
    expect(values(personNameDetector, 'DisplayName = "Bea Demo Person"')).toEqual([
      'Bea Demo Person',
    ]);
    expect(values(personNameDetector, 'Owner: Alex Demo')).toEqual(['Alex Demo']);
  });

  it('finds single first/last-name fields and common name punctuation', () => {
    const text = [
      'FirstName = "Élodie"',
      'Last Name: O’Connor-Smith',
      'Approver: Jean-Luc Picard',
      'Name: Alex T.',
      'Owner: "O\'Brien Demo"',
    ].join('\n');
    expect(values(personNameDetector, text)).toEqual([
      'Élodie',
      'O’Connor-Smith',
      'Jean-Luc Picard',
      'Alex T.',
      "O'Brien Demo",
    ]);
  });

  it('finds multiple quoted name examples when the line has clear name context', () => {
    const text = 'Names to hide: "Alex T." "Bea Example" "Chris Demo-Person"';
    expect(values(personNameDetector, text)).toEqual([
      'Alex T.',
      'Bea Example',
      'Chris Demo-Person',
    ]);
  });

  it('finds clear PowerShell comment bylines', () => {
    const text = [
      '# Author: Alex Demo',
      '# Created by Bea Example-Person for the deployment team',
      '# Contact Chris Sample if the import fails.',
      '# This comment mentions Alex Demo without a byline and stays untouched.',
    ].join('\n');
    expect(values(personNameDetector, text)).toEqual([
      'Alex Demo',
      'Bea Example-Person',
      'Chris Sample',
    ]);
  });

  it('never guesses names in free text', () => {
    expect(values(personNameDetector, 'Alex Morgan met Bea Demo for a review')).toEqual([]);
  });

  it('accepts a single capitalized Name value but ignores constants, hosts, and variables', () => {
    expect(values(personNameDetector, 'Name: Alex')).toEqual(['Alex']);
    expect(values(personNameDetector, 'Name: TRUE')).toEqual([]);
    expect(values(personNameDetector, 'Name: ws-144.example.internal')).toEqual([]);
    expect(values(personNameDetector, 'DisplayName = $displayName')).toEqual([]);
    expect(values(personNameDetector, 'Hostname: server01')).toEqual([]); // key not matched
    expect(values(personNameDetector, 'Name: Deployment failed')).toEqual([]); // lowercase 2nd word
  });
});

describe('organization name detector (strict)', () => {
  it('finds org names in explicitly labeled fields', () => {
    expect(values(orgNameDetector, 'Company: Contoso Health')).toEqual(['Contoso Health']);
    expect(values(orgNameDetector, 'TenantName = "Contoso"')).toEqual(['Contoso']);
    // Trailing sentence punctuation is not captured.
    expect(values(orgNameDetector, 'Organization: Contoso & Sons Ltd.')).toEqual([
      'Contoso & Sons Ltd',
    ]);
  });

  it('finds expanded organization labels and organization-shaped comment context', () => {
    const text = [
      'Department: Example Clinical Systems',
      'Facility = "Northwind Regional Hospital"',
      'Employer = "O\'Brien Community Health"',
      '# Script prepared for St. Example Healthcare Hamilton by Alex Demo',
    ].join('\n');
    expect(values(orgNameDetector, text)).toEqual([
      'Example Clinical Systems',
      'Northwind Regional Hospital',
      "O'Brien Community Health",
      'St. Example Healthcare Hamilton',
    ]);
  });

  it('never guesses org names in free text', () => {
    expect(values(orgNameDetector, 'Contoso Health released a statement')).toEqual([]);
  });

  it('ignores lowercase values and variables', () => {
    expect(values(orgNameDetector, 'company: internal use only')).toEqual([]);
    expect(values(orgNameDetector, 'Company = $orgName')).toEqual([]);
  });
});

describe('line-boundary regressions', () => {
  it('org values never absorb the next line', () => {
    const text = 'Company: Contoso\nOwner: Alex Demo';
    expect(values(orgNameDetector, text)).toEqual(['Contoso']);
    expect(values(personNameDetector, text)).toEqual(['Alex Demo']);
  });

  it('org values never cross CRLF boundaries either', () => {
    expect(values(orgNameDetector, 'TenantName: Contoso Health\r\nManager: Bea Demo')).toEqual([
      'Contoso Health',
    ]);
  });

  it('a label at end of line never consumes a value from the next line', () => {
    expect(values(orgNameDetector, 'Company:\nContoso Health')).toEqual([]);
    expect(values(personNameDetector, 'Owner:\nAlex Demo')).toEqual([]);
  });
});

describe('strict rules inside the full engine', () => {
  it('redact labeled names with their own placeholders', () => {
    const text = 'Owner: Alex Demo   Company: Contoso Health';
    const findings = scanText(text, { enabledDetectorIds: strictIds });
    expect(buildCleanText(text, findings)).toBe('Owner: [NAME_1]   Company: [ORG_1]');
  });

  it('lose to more specific detectors on overlap', () => {
    // The email detector (priority 70) must win over person-name context.
    const text = 'Contact: alex.demo@example.internal';
    const findings = scanText(text, { enabledDetectorIds: strictIds });
    expect(findings.map((f) => f.detectorId)).toEqual(['email']);
  });

  it('stay disabled in the balanced profile', () => {
    const text = 'Owner: Alex Demo   Company: Contoso Health';
    expect(scanText(text)).toEqual([]);
  });
});
