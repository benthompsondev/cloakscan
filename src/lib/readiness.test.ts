import { describe, expect, it } from 'vitest';
import { assessReadiness } from './readiness';
import type { Finding } from './types';
import type { CloakCandidate } from './candidates';
import type { CodeWarning } from './codeWarnings';

function finding(patch: Partial<Finding>): Finding {
  return {
    id: 'f1',
    detectorId: 'test',
    name: 'Test finding',
    category: 'secrets',
    severity: 'medium',
    confidence: 'high',
    explanation: 'Synthetic test finding.',
    start: 0,
    end: 4,
    value: 'test',
    placeholder: '[TEST_1]',
    enabled: true,
    ...patch,
  };
}

const candidate = (generic = false): CloakCandidate => ({
  text: generic ? 'Active Directory' : 'Contoso Health',
  count: 1,
  firstStart: 0,
  generic,
});

const warning: CodeWarning = {
  line: 3,
  snippet: '$[ORG_TERM_1] = 1',
  reason: 'A placeholder replaced a variable name.',
};

describe('assessReadiness', () => {
  it('is ready when everything is handled', () => {
    const report = assessReadiness({
      findings: [finding({})],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    expect(report.status).toBe('ready');
    expect(report.items).toEqual([]);
  });

  it('warns about high-severity findings kept as-is', () => {
    const report = assessReadiness({
      findings: [finding({ severity: 'high', enabled: false })],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    expect(report.status).toBe('review');
    expect(report.items[0].kind).toBe('kept-findings');
    expect(report.items[0].tone).toBe('warn');
    expect(report.items[0].message).toContain('1 high');
  });

  it('warns about medium-severity findings kept as-is', () => {
    const report = assessReadiness({
      findings: [finding({ severity: 'medium', enabled: false })],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    expect(report.status).toBe('review');
    expect(report.items[0].kind).toBe('kept-findings');
    expect(report.items[0].tone).toBe('warn');
    expect(report.items[0].message).toContain('1 medium');
  });

  it('reports low-severity keeps as informational, still not ready', () => {
    const report = assessReadiness({
      findings: [finding({ severity: 'low', enabled: false })],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    expect(report.status).toBe('review');
    expect(report.items[0].kind).toBe('kept-findings-low');
    expect(report.items[0].tone).toBe('info');
  });

  it('splits mixed keeps into one warning and one informational item', () => {
    const report = assessReadiness({
      findings: [
        finding({ id: 'f1', severity: 'high', enabled: false }),
        finding({ id: 'f2', severity: 'medium', enabled: false }),
        finding({ id: 'f3', severity: 'low', enabled: false }),
      ],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    const serious = report.items.find((i) => i.kind === 'kept-findings');
    const low = report.items.find((i) => i.kind === 'kept-findings-low');
    expect(serious?.count).toBe(2);
    expect(serious?.message).toContain('1 high, 1 medium');
    expect(low?.count).toBe(1);
  });

  it('does not count a disabled review lead as a high-severity keep', () => {
    const report = assessReadiness({
      findings: [finding({ severity: 'high', enabled: false, reviewLead: true })],
      candidates: [],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    expect(report.items.map((i) => i.kind)).toEqual(['review-leads']);
  });

  it('counts only org-specific candidates, not generic IT phrases', () => {
    const report = assessReadiness({
      findings: [],
      candidates: [candidate(false), candidate(true)],
      codeWarnings: [],
      outputMode: 'safe-share',
    });
    const item = report.items.find((i) => i.kind === 'candidates');
    expect(item?.count).toBe(1);
  });

  it('flags code warnings with mode-specific guidance', () => {
    const safeShare = assessReadiness({
      findings: [],
      candidates: [],
      codeWarnings: [warning],
      outputMode: 'safe-share',
    });
    expect(safeShare.items[0].message).toContain('Portfolio-code mode');

    const portfolio = assessReadiness({
      findings: [],
      candidates: [],
      codeWarnings: [warning],
      outputMode: 'portfolio-code',
    });
    expect(portfolio.items[0].message).toContain('code-safe replacements');
  });

  it('reports how many findings carry a replacement for the mode comparison', () => {
    const report = assessReadiness({
      findings: [finding({ replacement: 'SourceSystem' }), finding({ id: 'f2' })],
      candidates: [],
      codeWarnings: [],
      outputMode: 'portfolio-code',
    });
    expect(report.replacementCount).toBe(1);
  });
});
