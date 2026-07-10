import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TERMS_OPTIONS,
  analyzePrivateTerms,
  createPrivateTermsDetector,
  parsePrivateTerms,
} from './customTerms';
import { MAX_TERMS_PER_PACK, MAX_TERM_LENGTH, emptyPackTerms } from './customPacks';
import { parseCloakListText, summarizeCloakListImport } from './customPacks';
import { scanText } from './scan';
import { buildCleanText } from './sanitize';
import { createEmptySession } from './session';

describe('parsePrivateTerms', () => {
  it('trims, dedupes case-insensitively, drops short lines, sorts longest first', () => {
    const terms = parsePrivateTerms('  Contoso \ncontoso\nContoso General\n\nx\nsrv-app01\n');
    expect(terms).toEqual(['Contoso General', 'srv-app01', 'Contoso']);
  });
});

describe('term safety', () => {
  it(`skips a term over ${MAX_TERM_LENGTH} characters WHOLE and reports its line`, () => {
    const long = 'x'.repeat(MAX_TERM_LENGTH + 1);
    const analysis = analyzePrivateTerms(`Contoso\n${long}\nsrv-app01`);
    expect(analysis.tooLong).toEqual([2]);
    expect(analysis.terms).toEqual(['srv-app01', 'Contoso']);
    // Never a truncated prefix of the long term:
    expect(analysis.terms.some((t) => long.startsWith(t))).toBe(false);
  });

  it(`keeps a term of exactly ${MAX_TERM_LENGTH} characters`, () => {
    const exact = 'y'.repeat(MAX_TERM_LENGTH);
    const analysis = analyzePrivateTerms(exact);
    expect(analysis.terms).toEqual([exact]);
    expect(analysis.tooLong).toEqual([]);
  });

  it(`enforces the ${MAX_TERMS_PER_PACK}-term limit without silently accepting the rest`, () => {
    const input = Array.from({ length: MAX_TERMS_PER_PACK + 2 }, (_, i) => `term-${i}`).join('\n');
    const analysis = analyzePrivateTerms(input);
    expect(analysis.terms).toHaveLength(MAX_TERMS_PER_PACK);
    expect(analysis.overLimit).toEqual([MAX_TERMS_PER_PACK + 1, MAX_TERMS_PER_PACK + 2]);
  });

  it('defaults to exact words/phrases — inside-word matching is opt-in', () => {
    expect(DEFAULT_TERMS_OPTIONS.matchInsideWords).toBe(false);
    expect(createEmptySession().termsMatchInsideWords).toBe(false);
    expect(emptyPackTerms().matchInsideWords).toBe(false);

    const detector = createPrivateTermsDetector(['demo']);
    expect(detector.detect('demos of demo').map((m) => m.value)).toEqual(['demo']);
  });

  it('reports duplicate lines while keeping the first occurrence', () => {
    const analysis = analyzePrivateTerms('Contoso\ncontoso\nCONTOSO\nother');
    expect(analysis.duplicates).toEqual([2, 3]);
    expect(analysis.terms).toEqual(['Contoso', 'other']);
  });

  it('matches regex metacharacters literally, never as patterns', () => {
    const detector = createPrivateTermsDetector(['a.b(c)*', 'x+y'], {
      caseSensitive: false,
      matchInsideWords: true,
    });
    const text = 'raw a.b(c)* and aXb(c)* and x+y and xxy';
    expect(detector.detect(text).map((m) => m.value)).toEqual(['a.b(c)*', 'x+y']);
  });

  it('tolerates common apostrophe, dash, and horizontal-spacing variants', () => {
    const detector = createPrivateTermsDetector(["O'Brien Health", 'North-West Team']);
    const text = 'O’Brien   Health worked with North–West Team';
    expect(detector.detect(text).map((m) => m.value)).toEqual([
      'O’Brien   Health',
      'North–West Team',
    ]);
  });
});

describe('Cloak List .txt import parsing', () => {
  it('trims, dedupes, skips empty lines, appends to current terms, and reports the result', () => {
    const result = parseCloakListText(
      ' Contoso General \n\ncontoso general\nProject Nightjar\n',
      ['Existing Term'],
    );
    expect(result.terms).toEqual(['Existing Term', 'Contoso General', 'Project Nightjar']);
    expect(result.added).toBe(2);
    expect(result.droppedEmpty).toBe(2);
    expect(result.droppedDuplicate).toBe(1);
    expect(summarizeCloakListImport(result)).toBe(
      'Imported 2 terms — skipped 1 — content stays in memory only.',
    );
  });

  it(`drops over-length terms and stops at ${MAX_TERMS_PER_PACK} total terms`, () => {
    const existingTerms = Array.from({ length: MAX_TERMS_PER_PACK - 1 }, (_, i) => `term-${i}`);
    const result = parseCloakListText(`fresh-one\n${'x'.repeat(MAX_TERM_LENGTH + 1)}\nfresh-two`, existingTerms);
    expect(result.terms).toHaveLength(MAX_TERMS_PER_PACK);
    expect(result.terms.at(-1)).toBe('fresh-one');
    expect(result.droppedTooLong).toBe(1);
    expect(result.capped).toBe(true);
  });
});

describe('cloak term scanning', () => {
  it('keeps the default custom-term placeholder byte-identical', () => {
    const text = 'Contoso and Northwind';
    const findings = scanText(text, {
      extraDetectors: [createPrivateTermsDetector(['Contoso', 'Northwind'])],
      enabledDetectorIds: [],
    });
    expect(buildCleanText(text, findings)).toBe('[CUSTOM_TERM_1] and [CUSTOM_TERM_2]');
  });

  it('supports a detector-specific format and label without changing the global format', () => {
    const text = 'Contoso and Northwind';
    const detector = createPrivateTermsDetector(['Contoso', 'Northwind'], {
      ...DEFAULT_TERMS_OPTIONS,
      template: '<{TYPE}:{INDEX}>',
      label: 'CLIENT',
    });
    const findings = scanText(text, {
      extraDetectors: [detector],
      enabledDetectorIds: [],
      placeholderTemplate: '[GLOBAL_{INDEX}]',
    });
    expect(buildCleanText(text, findings)).toBe('<CLIENT:1> and <CLIENT:2>');
  });

  it('falls back to the stable defaults for an invalid custom format or label', () => {
    const detector = createPrivateTermsDetector(['Contoso'], {
      ...DEFAULT_TERMS_OPTIONS,
      template: '{MATCHED_VALUE}',
      label: 'not valid!',
    });
    const findings = scanText('Contoso', {
      extraDetectors: [detector],
      enabledDetectorIds: [],
    });
    expect(findings[0]?.placeholder).toBe('[CUSTOM_TERM_1]');
  });

  it('matches literally and case-insensitively with one stable placeholder', () => {
    const text = 'Contoso staff met CONTOSO vendors at contoso HQ';
    const findings = scanText(text, { privateTerms: parsePrivateTerms('Contoso') });
    expect(findings).toHaveLength(3);
    expect(new Set(findings.map((f) => f.placeholder)).size).toBe(1);
    expect(buildCleanText(text, findings)).toBe(
      '[CUSTOM_TERM_1] staff met [CUSTOM_TERM_1] vendors at [CUSTOM_TERM_1] HQ',
    );
  });

  it('reuses one placeholder across normalized punctuation variants', () => {
    const text = "O'Brien Health and O’Brien Health";
    const findings = scanText(text, { privateTerms: parsePrivateTerms("O'Brien Health") });
    expect(findings).toHaveLength(2);
    expect(new Set(findings.map((finding) => finding.placeholder)).size).toBe(1);
  });

  it('prefers the longest term when terms overlap', () => {
    const text = 'welcome to Contoso General Hospital';
    const findings = scanText(text, { privateTerms: parsePrivateTerms('Contoso\nContoso General Hospital') });
    expect(findings.map((f) => f.value)).toEqual(['Contoso General Hospital']);
  });

  it('treats terms as literals, not regex', () => {
    const text = 'value a.c and abc appear';
    const findings = scanText(text, { privateTerms: parsePrivateTerms('a.c') });
    expect(findings.map((f) => f.value)).toEqual(['a.c']);
  });

  it('redacts custom domains inside public-suffix URLs', () => {
    const text = 'see https://portal.contoso-health.org/patients for details';
    const findings = scanText(text, { privateTerms: parsePrivateTerms('contoso-health.org') });
    expect(findings.map((f) => f.detectorId)).toEqual(['private-term']);
    expect(buildCleanText(text, findings)).toBe(
      'see https://portal.[CUSTOM_TERM_1]/patients for details',
    );
  });

  it('lets the more specific detector win when a term sits inside a larger value', () => {
    const text = 'mail alex.demo@contoso.example.internal today';
    const findings = scanText(text, { privateTerms: parsePrivateTerms('contoso') });
    expect(findings.map((f) => f.detectorId)).toEqual(['email']);
    expect(buildCleanText(text, findings)).toBe('mail [EMAIL_1] today');
  });

  it('produces no custom findings when no terms are given', () => {
    expect(scanText('Contoso everywhere').filter((f) => f.detectorId === 'private-term')).toEqual(
      [],
    );
  });
});

describe('session clearing', () => {
  it('an empty session has no custom terms to hide', () => {
    expect(createEmptySession()).toEqual({
      sourceText: '',
      privateTermsInput: '',
      termsCaseSensitive: false,
      termsMatchInsideWords: false,
      termsFormat: { id: 'indexed', customTemplate: '[{TYPE}_{INDEX}]' },
      termsLabel: 'CUSTOM_TERM',
      dismissedCandidateKeys: [],
      outputMode: 'safe-share',
      findings: [],
      hasScanned: false,
    });
  });
});
