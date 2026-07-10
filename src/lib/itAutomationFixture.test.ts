/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { enabledRuleIds, profileRuleStates } from './profiles';
import { applyOutputMode, buildCleanText } from './sanitize';
import { scanText } from './scan';
import { findCodeWarnings } from './codeWarnings';
import { createMappedTermsDetector, emptyMappingEntry } from './cloakMappings';

const fixturePath = join(
  __dirname, '..', '..', 'examples', 'stress-tests', 'it-automation-workflow.ps1',
);
const source = readFileSync(fixturePath, 'utf8');
const strictIds = enabledRuleIds(profileRuleStates('strict'));

// Two mappings, longest wins on overlap: NirvSystemID -> SourceSystemID
// (via NirvSystem), NirvAccess -> SourceSystemAccess (via Nirv).
const nirvMappings = [
  { ...emptyMappingEntry('m-nirv'), term: 'Nirv', replacement: 'SourceSystem' },
  { ...emptyMappingEntry('m-nirv-system'), term: 'NirvSystem', replacement: 'SourceSystem' },
];

describe('synthetic IT automation fixture', () => {
  const findings = scanText(source, { enabledDetectorIds: strictIds });

  it('detects AD group and license group names as redactable findings', () => {
    const groups = findings.filter((f) => f.detectorId === 'ad-group-name');
    expect(groups.map((g) => g.value)).toEqual(
      expect.arrayContaining(['APP-NirvPortal-Users', 'LIC-M365-E3-Standard']),
    );
    expect(groups.every((g) => g.enabled)).toBe(true);
  });

  it('classifies review leads across directory, exchange, credential, and workflow', () => {
    const leadDetectors = new Set(
      findings.filter((f) => f.reviewLead).map((f) => f.detectorId),
    );
    for (const id of [
      'directory-attribute',
      'exchange-workflow',
      'credential-workflow',
      'author-initials',
      'workflow-artifact',
      'csv-identity-header',
    ]) {
      expect(leadDetectors.has(id), `expected review lead ${id}`).toBe(true);
    }
    expect(findings.filter((f) => f.reviewLead).every((f) => !f.enabled)).toBe(true);
  });

  it('finds the author initials from the history block', () => {
    const initials = findings
      .filter((f) => f.detectorId === 'author-initials')
      .map((f) => f.value);
    expect(initials).toEqual(expect.arrayContaining(['JQ', 'TR']));
  });

  it('flags the internal Exchange URL and the OU line', () => {
    const ids = new Set(findings.map((f) => f.detectorId));
    expect(ids.has('internal-url')).toBe(true);
    expect(ids.has('ad-dn')).toBe(true);
  });

  it('never touches the regex pattern or the generated password expression', () => {
    const cleaned = buildCleanText(source, findings);
    expect(cleaned).toContain(`-replace '[^a-zA-Z0-9]', ''`);
    expect(cleaned).toContain('$newPassword = New-StarterPassword -Length 16');
  });
});

describe('fixture in portfolio-code mode with a Nirv mapping', () => {
  const findings = scanText(source, {
    enabledDetectorIds: strictIds,
    extraDetectors: [createMappedTermsDetector(nirvMappings, 'Cloak mapping (Org)')],
  });

  it('rewrites org-term identifiers into valid generic ones', () => {
    const cleaned = buildCleanText(source, applyOutputMode(findings, 'portfolio-code'));
    expect(cleaned).toContain('function Enable-SourceSystemAccount {');
    expect(cleaned).toContain('$objUser.SourceSystemAccess = $true');
    expect(cleaned).toContain('$sourceSystemId = $SourceSystemID.Trim()');
    // No new invalid-identifier damage from the mapped term itself.
    const warnings = findCodeWarnings(cleaned);
    expect(warnings.filter((w) => w.snippet.includes('SourceSystem'))).toEqual([]);
  });

  it('keeps bracket placeholders for the same term in safe-share mode', () => {
    const cleaned = buildCleanText(source, applyOutputMode(findings, 'safe-share'));
    expect(cleaned).not.toContain('SourceSystem');
    expect(cleaned).toContain('[CUSTOM_TERM_1]');
  });
});
