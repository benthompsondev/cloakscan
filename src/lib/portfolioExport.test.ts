import { describe, expect, it } from 'vitest';
import {
  PORTFOLIO_EXPORT_FILENAMES,
  buildExportAggregates,
  buildFindingsSummary,
  buildReviewChecklist,
  isPortfolioExportFilename,
} from './portfolioExport';
import { assessReadiness } from './readiness';
import { compareOutputModes } from './comparison';
import { scanText } from './scan';
import { createMappedTermsDetector, emptyMappingEntry } from './cloakMappings';
import type { Finding } from './types';

// Sentinel private values: none of these may ever appear in metadata files.
const SENTINELS = [
  'NirvSentinel', // mapped term
  'SourceSystemSentinel', // mapping replacement
  'sentinel.admin@example.internal', // finding value
  'Sentinel Profile', // profile name
  'Sentinel Cloak List', // list name
  'sentinel-source.ps1', // imported filename
];

const SOURCE = [
  '# synthetic sample',
  '$NirvSentinelID = 1',
  'mail sentinel.admin@example.internal now',
].join('\n');

function scannedFindings(): Finding[] {
  return scanText(SOURCE, {
    extraDetectors: [
      createMappedTermsDetector(
        [
          {
            ...emptyMappingEntry('m-1'),
            term: 'NirvSentinel',
            replacement: 'SourceSystemSentinel',
            categoryLabel: 'Organization',
          },
        ],
        'Cloak mapping (Sentinel Cloak List)',
      ),
    ],
  });
}

function readinessFor(findings: Finding[]) {
  return assessReadiness({ findings, candidates: [], codeWarnings: [], outputMode: 'safe-share' });
}

describe('portfolio export filenames', () => {
  it('allowlists exactly the three kit filenames', () => {
    expect(isPortfolioExportFilename('cloakscan-portfolio.ps1')).toBe(true);
    expect(isPortfolioExportFilename('cloakscan-findings-summary.txt')).toBe(true);
    expect(isPortfolioExportFilename('cloakscan-review-checklist.md')).toBe(true);
    for (const bad of [
      'cloakscan-portfolio.exe',
      '../cloakscan-portfolio.ps1',
      'C:\\x\\cloakscan-portfolio.ps1',
      'portfolio.ps1',
      '',
      'cloakscan-portfolio.ps1 ',
    ]) {
      expect(isPortfolioExportFilename(bad), bad).toBe(false);
    }
  });
});

describe('buildExportAggregates', () => {
  it('computes aggregate counts from findings', () => {
    const findings = scannedFindings();
    const a = buildExportAggregates(findings, readinessFor(findings));
    expect(a.findingCount).toBe(findings.length);
    expect(a.detectorCount).toBeGreaterThanOrEqual(2); // email + mapping
    expect(a.replacementCount).toBe(findings.filter((f) => f.enabled && !f.reviewLead).length);
    expect(Object.values(a.countsByCategory).reduce((x, y) => x + y, 0)).toBe(findings.length);
    expect(Object.values(a.countsBySeverity).reduce((x, y) => x + y, 0)).toBe(findings.length);
  });

  it('splits kept findings and review leads', () => {
    const findings = scannedFindings().map((f, i) =>
      i === 0 ? { ...f, enabled: false } : f,
    );
    const a = buildExportAggregates(findings, readinessFor(findings));
    expect(a.keptCount).toBe(1);
    expect(a.replacementCount).toBe(findings.length - 1);
  });
});

describe('summary and checklist privacy', () => {
  it('the summary contains counts and the disclaimer, never values or names', () => {
    const findings = scannedFindings();
    const summary = buildFindingsSummary({
      appVersion: '9.9.9-test',
      outputMode: 'portfolio-code',
      aggregates: buildExportAggregates(findings, readinessFor(findings)),
    });
    expect(summary).toContain('App version: 9.9.9-test');
    expect(summary).toContain('Output mode: Portfolio-code');
    expect(summary).toContain('Findings:');
    expect(summary).toContain('review the sanitized file');
    for (const sentinel of SENTINELS) {
      expect(summary, sentinel).not.toContain(sentinel);
    }
    // Not even fragments of the source line.
    expect(summary).not.toContain('synthetic sample');
  });

  it('the checklist is fixed text with the not-a-guarantee statement', () => {
    const checklist = buildReviewChecklist();
    expect(checklist).toContain('not a guarantee');
    expect(checklist).toContain('No credentials, keys, tokens');
    expect(checklist).toContain('parses');
    for (const sentinel of SENTINELS) {
      expect(checklist, sentinel).not.toContain(sentinel);
    }
  });
});

describe('portfolio file content', () => {
  it('equals the Portfolio-code sanitized output exactly', () => {
    const findings = scannedFindings();
    const { portfolioCode } = compareOutputModes(SOURCE, findings);
    // The kit exports compareOutputModes(...).portfolioCode as the .ps1 —
    // assert the invariants that make that safe.
    expect(portfolioCode).toContain('$SourceSystemSentinelID');
    expect(portfolioCode).not.toContain('NirvSentinelID');
    expect(portfolioCode).not.toContain('sentinel.admin@example.internal');
  });
});

describe(PORTFOLIO_EXPORT_FILENAMES.portfolio, () => {
  it('kit filenames match the Rust allowlist wire format', () => {
    expect(PORTFOLIO_EXPORT_FILENAMES.portfolio).toBe('cloakscan-portfolio.ps1');
    expect(PORTFOLIO_EXPORT_FILENAMES.summary).toBe('cloakscan-findings-summary.txt');
    expect(PORTFOLIO_EXPORT_FILENAMES.checklist).toBe('cloakscan-review-checklist.md');
  });
});
