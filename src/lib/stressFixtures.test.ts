/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enabledRuleIds, profileRuleStates } from './profiles';
import { buildCleanText } from './sanitize';
import { scanText } from './scan';

const fixtureRoot = join(__dirname, '..', '..', 'examples', 'stress-tests');
const strictIds = enabledRuleIds(profileRuleStates('strict'));

function scanFixture(name: string, privateTerms: string[] = []): {
  source: string;
  cleaned: string;
  detectorIds: Set<string>;
} {
  const source = readFileSync(join(fixtureRoot, name), 'utf8');
  const findings = scanText(source, {
    enabledDetectorIds: strictIds,
    privateTerms,
  });
  return {
    source,
    cleaned: buildCleanText(source, findings),
    detectorIds: new Set(findings.map((finding) => finding.detectorId)),
  };
}

function expectNoHighValueResiduals(cleaned: string): void {
  expect(cleaned).not.toMatch(
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/,
  );
  expect(cleaned).not.toMatch(/@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/);
  expect(cleaned).not.toMatch(/\b[A-Za-z]:\\/);
}

describe('public manual stress fixtures', () => {
  it('covers PowerShell identity, domain, path, secret, and PII shapes', () => {
    const { cleaned, detectorIds } = scanFixture('powershell-identity-and-paths.ps1');
    expectNoHighValueResiduals(cleaned);
    for (const id of [
      'email',
      'windows-user-path',
      'unc-path',
      'person-name',
      'org-name',
      'secret-assignment',
      'internal-hostname',
      'internal-url',
      'ipv4',
    ]) {
      expect(detectorIds.has(id), `expected ${id} in PowerShell fixture`).toBe(true);
    }
    expect(cleaned).toContain('$GeneratedPassword = New-Guid');
    expect(cleaned).toContain('$RandomPassword = Get-RandomPassword');
    expect(cleaned).toContain("$TicketPattern = '^(INC|CHG|REQ)\\d{6}$'");
  });

  it('cleans the support log without leaving partial spaced paths or mail suffixes', () => {
    const { cleaned } = scanFixture('support-log-and-ticket.txt');
    expectNoHighValueResiduals(cleaned);
    expect(cleaned).not.toContain('Alex Demo');
    expect(cleaned).not.toContain('Northwind Regional Hospital');
  });

  it('cleans labeled mixed configuration values while preserving structure', () => {
    const { source, cleaned } = scanFixture('mixed-config-export.txt');
    expectNoHighValueResiduals(cleaned);
    expect(cleaned.split(/\r?\n/)).toHaveLength(source.split(/\r?\n/).length);
    expect(cleaned).toContain('generated_password = $GeneratedPassword');
    expect(cleaned).toContain('password_command = Get-RandomPassword');

    // JSON block: values are redacted, keys and structure stay byte-for-byte.
    for (const value of ['Jean-Luc Picard', 'Regional Support Services']) {
      expect(cleaned, `JSON value "${value}" must be redacted`).not.toContain(value);
    }
    expect(cleaned).toContain('"displayName": "[NAME_');
    expect(cleaned).toContain('"companyName": "[ORG_');
    expect(cleaned).toContain('"department": "[ORG_');

    // CSV block: person/org cells are redacted, header and quoting stay intact.
    expect(cleaned).toContain('DisplayName,UserPrincipalName,Company,Department,Phone');
    for (const value of [
      'Alex Demo',
      'Bea Example',
      'Chris Sample',
      'Northwind Regional Hospital',
      'Example Community Health',
      'Clinical Systems Demo',
    ]) {
      expect(cleaned, `CSV value "${value}" must be redacted`).not.toContain(value);
    }
    expect(cleaned).toMatch(/"\[NAME_\d+\]","\[EMAIL_\d+\]","\[ORG_\d+\]","\[ORG_\d+\]"/);
  });

  it('cleans the name/organization stress file across PowerShell, JSON, CSV, logs, and prose', () => {
    const { source, cleaned, detectorIds } = scanFixture('names-and-organizations.txt');
    expect(detectorIds.has('person-name')).toBe(true);
    expect(detectorIds.has('org-name')).toBe(true);
    expect(cleaned.split(/\r?\n/)).toHaveLength(source.split(/\r?\n/).length);

    // Expected redactions across every syntax section.
    for (const value of [
      'Alex Demo',
      'Bea Example-Person',
      'Casey Rivera',
      'Rowan Ashford',
      'Morgan Vance',
      'Anna van der Berg',
      'Priya Raman',
      'Nico D’Angelo',
      "Ciara O'Connor",
      'Élodie',
      'Marchand',
      'Sofía Andrade',
      '田中',
      'Northwind Regional Hospital',
      "St. Brigid's Healthcare Exampleville",
      'Fabrikam & Sons Ltd',
      'Trey Research Institute',
      'Wide World Importers Inc',
      'Regional Support Services',
      'Lamna Healthcare Company',
      "O'Hara Family Clinic",
      '北風商事',
    ]) {
      expect(cleaned, `expected "${value}" to be redacted`).not.toContain(value);
    }

    // Command syntax, non-name prose, and the documented free-text boundary
    // stay byte-for-byte.
    for (const untouched of [
      'Get-Process -Name "WindowsTerminal" | Stop-Process -WhatIf',
      'Get-Service -Name "ExampleAgent"',
      'Select-Object -Property Name, Status',
      '$ServiceName = "Print Spooler"',
      'Name = Get-Random',
      'Company = $Company',
      'FirstName,LastName,Company,Department,Status',
      'Status,Count,Result',
      'Active,5,OK',
      'Alex Morgan met Bea Demo for a review of the change window.',
      'May, Rose, and Main are street names near the office.',
      'Contact support if the export fails; contact IT Help Desk otherwise.',
      'Priya spoke with the vendor and Dmitri joined late.',
      'NWRH sent the quarterly update to every site.',
    ]) {
      expect(cleaned, `expected untouched: ${untouched}`).toContain(untouched);
    }
  });

  it('uses custom terms for organization aliases and normalizes punctuation variants', () => {
    const terms = [
      'Northwind Regional Health',
      'Project Firefly',
      "O'Brien Demo Team",
      'example-health.org',
    ];
    const { cleaned, detectorIds } = scanFixture('sharing-draft-and-custom-terms.md', terms);
    expectNoHighValueResiduals(cleaned);
    expect(detectorIds.has('private-term')).toBe(true);
    for (const value of [
      'Northwind Regional Health',
      'Project Firefly',
      "O'Brien Demo Team",
      'O’Brien Demo Team',
      'example-health.org',
    ]) {
      expect(cleaned).not.toContain(value);
    }
  });
});
