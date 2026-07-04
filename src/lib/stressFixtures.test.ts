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
