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

describe('v0.7 name/organization assurance characterization', () => {
  it('finds names after clear prose cues (contact / as per / pulled from / lifted from)', () => {
    expect(values(personNameDetector, 'csv formatted as per Casey R specifications')).toEqual([
      'Casey R',
    ]);
    expect(
      values(personNameDetector, 'AD group list pulled from Casey Rivera and imported'),
    ).toEqual(['Casey Rivera']);
    expect(values(personNameDetector, 'Lifted from Morgan Vance')).toEqual(['Morgan Vance']);
    expect(values(personNameDetector, 'Contact Rowan Ashford?')).toEqual(['Rowan Ashford']);
  });

  it('finds person values under quoted JSON keys without touching the keys', () => {
    const text = '{"name": "Alex Demo", "status": "active", "requestedBy": "Bea Example"}';
    expect(values(personNameDetector, text)).toEqual(['Alex Demo', 'Bea Example']);
    const findings = scanText(text, { enabledDetectorIds: strictIds });
    expect(buildCleanText(text, findings)).toBe(
      '{"name": "[NAME_1]", "status": "active", "requestedBy": "[NAME_2]"}',
    );
  });

  it('finds organization values under quoted JSON keys', () => {
    expect(
      values(orgNameDetector, '"companyName": "Northwind Traders Ltd", "count": 3'),
    ).toEqual(['Northwind Traders Ltd']);
  });

  it('finds person and organization cells under recognized CSV headers', () => {
    const csv = 'FirstName,LastName,Department,Status\r\nAlex,Demo,Example Clinical Systems,Active\r\n';
    expect(values(personNameDetector, csv)).toEqual(['Alex', 'Demo']);
    expect(values(orgNameDetector, csv)).toEqual(['Example Clinical Systems']);
  });

  it('accepts generational suffixes and multi-word particles', () => {
    expect(values(personNameDetector, 'Owner: Alex Demo II')).toEqual(['Alex Demo II']);
    expect(values(personNameDetector, 'Owner: Anna van der Berg')).toEqual(['Anna van der Berg']);
    expect(values(personNameDetector, 'Owner: Omar al Farouk Jr.')).toEqual(['Omar al Farouk Jr.']);
  });

  it('finds copyright organizations in plain text and comments', () => {
    expect(
      values(orgNameDetector, "Copyright (c) 2024 St. Brigid's Healthcare Exampleville"),
    ).toEqual(["St. Brigid's Healthcare Exampleville"]);
    expect(
      values(orgNameDetector, '# Copyright 2019-2024 Northwind Community Services. All rights reserved.'),
    ).toEqual(['Northwind Community Services']);
  });

  it('accepts caseless-script values only under explicit labels', () => {
    expect(values(personNameDetector, 'Name: 田中太郎')).toEqual(['田中太郎']);
    expect(values(orgNameDetector, 'Organization: 北風商事')).toEqual(['北風商事']);
    // Never in free text, even for caseless scripts.
    expect(values(personNameDetector, '田中太郎 reviewed the deployment')).toEqual([]);
  });

  it('ignores PowerShell -Name parameters and cmdlet-shaped values', () => {
    expect(values(personNameDetector, 'Get-Process -Name "WindowsTerminal"')).toEqual([]);
    expect(values(personNameDetector, 'Get-Service -Name "ExampleAgent"')).toEqual([]);
    expect(values(personNameDetector, 'Name = Get-Random')).toEqual([]);
  });
});

describe('v0.7.1 hardening: more person contexts', () => {
  it('finds names under workflow labels (assigned to, requester, reviewer, attn)', () => {
    expect(values(personNameDetector, 'AssignedTo: Alex Demo')).toEqual(['Alex Demo']);
    expect(values(personNameDetector, 'Requester = "Bea Example"')).toEqual(['Bea Example']);
    expect(values(personNameDetector, 'Reviewer: Casey Rivera')).toEqual(['Casey Rivera']);
    expect(values(personNameDetector, 'Attn: Rowan Ashford')).toEqual(['Rowan Ashford']);
    expect(values(personNameDetector, 'Technician: Priya Raman')).toEqual(['Priya Raman']);
    expect(values(personNameDetector, 'Patient: Morgan Vance')).toEqual(['Morgan Vance']);
  });

  it('finds names in To/From/CC message headers', () => {
    const text = 'From: Alex Demo\nTo: Bea Example\nCC: Casey Rivera';
    expect(values(personNameDetector, text)).toEqual(['Alex Demo', 'Bea Example', 'Casey Rivera']);
    // Non-name header values stay untouched.
    expect(values(personNameDetector, 'From: relay01.example.internal')).toEqual([]);
  });

  it('finds honorific-prefixed names in free text', () => {
    expect(values(personNameDetector, 'Dr. Alex Demo will review the results')).toEqual([
      'Alex Demo',
    ]);
    expect(values(personNameDetector, 'escalate to Ms. Rivera before noon')).toEqual(['Rivera']);
    expect(values(personNameDetector, 'Prof. Élodie Marchand teaches the module')).toEqual([
      'Élodie Marchand',
    ]);
  });

  it('finds signature names after closings, same line and next line', () => {
    expect(values(personNameDetector, 'Thanks, Alex Demo')).toEqual(['Alex Demo']);
    expect(values(personNameDetector, 'Regards,\nBea Example')).toEqual(['Bea Example']);
    expect(values(personNameDetector, 'Kind regards,\nCasey Rivera\nHelpdesk')).toEqual([
      'Casey Rivera',
    ]);
    // A closing followed by a non-name line stays untouched.
    expect(values(personNameDetector, 'Thanks,\nthe deployment team')).toEqual([]);
  });

  it('finds names after escalation and conversation cues', () => {
    expect(values(personNameDetector, 'ticket escalated to Morgan Vance at 9am')).toEqual([
      'Morgan Vance',
    ]);
    expect(values(personNameDetector, 'spoke with Priya Raman about the outage')).toEqual([
      'Priya Raman',
    ]);
    expect(values(personNameDetector, 'handed off to Rowan Ashford overnight')).toEqual([
      'Rowan Ashford',
    ]);
  });
});

describe('v0.7.1 hardening: more organization contexts', () => {
  it('finds organizations under expanded labels', () => {
    expect(values(orgNameDetector, 'Customer: Woodgrove Bank Corp')).toEqual([
      'Woodgrove Bank Corp',
    ]);
    expect(values(orgNameDetector, 'Institution = "Bellows College"')).toEqual([
      'Bellows College',
    ]);
    expect(values(orgNameDetector, 'Partner: Proseware Solutions LLC')).toEqual([
      'Proseware Solutions LLC',
    ]);
    expect(values(orgNameDetector, 'Division: Clinical Systems Demo')).toEqual([
      'Clinical Systems Demo',
    ]);
  });

  it('finds strong-suffix organizations in free text', () => {
    expect(
      values(orgNameDetector, 'sent the export to Northwind Regional Hospital yesterday'),
    ).toEqual(['Northwind Regional Hospital']);
    expect(values(orgNameDetector, 'the invoice from Fabrikam & Sons Ltd arrived')).toEqual([
      'Fabrikam & Sons Ltd',
    ]);
    expect(values(orgNameDetector, 'Lamna Healthcare Company confirmed the outage')).toEqual([
      'Lamna Healthcare Company',
    ]);
  });

  it('free-text matching requires a STRONG suffix — generic phrases stay untouched', () => {
    expect(values(orgNameDetector, 'The Deployment Team approved the change window')).toEqual([]);
    expect(values(orgNameDetector, 'restart the Data Center switches')).toEqual([]);
    expect(values(orgNameDetector, 'the Working Group met on Friday')).toEqual([]);
    expect(values(orgNameDetector, 'Professional Services responded')).toEqual([]);
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
