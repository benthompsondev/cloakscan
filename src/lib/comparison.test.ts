import { describe, expect, it, vi } from 'vitest';
import { compareOutputModes } from './comparison';
import { scanText } from './scan';
import { createMappedTermsDetector, type CloakMappingEntry } from './cloakMappings';
import { emptyMappingEntry } from './cloakMappings';

const entry = (patch: Partial<CloakMappingEntry>): CloakMappingEntry => ({
  ...emptyMappingEntry(`m-${patch.term ?? 'x'}`),
  ...patch,
});

function scanWith(text: string, entries: CloakMappingEntry[]) {
  return scanText(text, {
    extraDetectors: [createMappedTermsDetector(entries, 'Cloak mapping (Test)')],
  });
}

describe('compareOutputModes', () => {
  it('produces both versions from the same findings without rescanning', () => {
    const text = '$NirvID = Get-Item';
    const findings = scanWith(text, [
      entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' }),
    ]);

    const result = compareOutputModes(text, findings);
    expect(result.safeShare).toContain('[');
    expect(result.portfolioCode).toContain('$SourceSystemID');
    // Neither output contains the original mapped term.
    expect(result.safeShare).not.toContain('Nirv');
    expect(result.portfolioCode).not.toContain('Nirv');
  });

  it('counts changed lines between the two versions', () => {
    const text = ['$NirvSystemID = 1', 'Write-Output done', '$NirvAgent = 2'].join('\n');
    const findings = scanWith(text, [
      entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' }),
    ]);
    const result = compareOutputModes(text, findings);
    // The two mapped-identifier lines differ; the plain line is identical.
    expect(result.changedLineCount).toBe(2);
  });

  it('reports zero changed lines when nothing carries a replacement', () => {
    const text = 'mail nirv.admin@example.com today';
    const findings = scanText(text, {});
    const result = compareOutputModes(text, findings);
    expect(result.safeShare).toBe(result.portfolioCode);
    expect(result.changedLineCount).toBe(0);
  });

  it('keeps secrets and infrastructure as placeholders in Portfolio-code', () => {
    const text = [
      'Server=nirv-sql01;Database=app;User Id=svc_app;Password=Fake1234!;',
      'https://nirv.example.internal/api',
      'ping 203.0.113.42',
      'guid 4de1cbb2-89ab-4cde-9012-3456789abcde',
      String.raw`\\nirv-fs01\share\out.csv`,
      'mail nirv.admin@example.com',
    ].join('\n');
    const findings = scanWith(text, [
      entry({ term: 'nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' }),
    ]);
    const { portfolioCode } = compareOutputModes(text, findings);
    for (const sensitive of [
      'Fake1234!',
      'nirv.example.internal',
      '203.0.113.42',
      '4de1cbb2',
      'nirv-fs01',
      'nirv.admin@example.com',
    ]) {
      expect(portfolioCode).not.toContain(sensitive);
    }
  });

  it('honors all four mapping strategies in the comparison', () => {
    const text = ['$NirvID = 1', '# Alpha note', 'Beta ran', 'Gamma ran'].join('\n');
    const findings = scanWith(text, [
      entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization', strategy: 'code-only' }),
      entry({ term: 'Alpha', replacement: 'GenericOrg', categoryLabel: 'Organization', strategy: 'genericize' }),
      entry({ term: 'Beta', replacement: '', categoryLabel: 'Organization', strategy: 'placeholder' }),
      entry({ term: 'Gamma', replacement: '', categoryLabel: 'Organization', strategy: 'review-lead' }),
    ]);
    const { safeShare, portfolioCode } = compareOutputModes(text, findings);

    // code-only: identifier replacement in portfolio, placeholder in safe-share.
    expect(portfolioCode).toContain('$SourceSystemID');
    expect(safeShare).not.toContain('$SourceSystemID');
    // genericize: replacement lands in prose in portfolio mode.
    expect(portfolioCode).toContain('GenericOrg');
    // placeholder: bracket placeholder in BOTH modes.
    expect(portfolioCode).not.toContain('Beta');
    expect(safeShare).not.toContain('Beta');
    // review-lead: flagged only, never rewritten — original stays in both.
    expect(portfolioCode).toContain('Gamma ran');
    expect(safeShare).toContain('Gamma ran');
  });

  it('never calls the scanner', async () => {
    const scan = await import('./scan');
    const spy = vi.spyOn(scan, 'scanText');
    const findings = scanWith('$NirvID = 1', [
      entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' }),
    ]);
    spy.mockClear();
    compareOutputModes('$NirvID = 1', findings);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('exposes only sanitized outputs and a count — no value-bearing metadata', () => {
    const findings = scanWith('$NirvID = 1', [
      entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' }),
    ]);
    const result = compareOutputModes('$NirvID = 1', findings);
    expect(Object.keys(result).sort()).toEqual([
      'changedLineCount',
      'portfolioCode',
      'safeShare',
    ]);
  });
});
