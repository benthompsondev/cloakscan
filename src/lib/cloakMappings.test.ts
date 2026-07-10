import { describe, expect, it } from 'vitest';
import {
  createMappedTermsDetector,
  emptyMappingEntry,
  usableMappings,
  validateMappingEntry,
  type CloakMappingEntry,
} from './cloakMappings';
import { applyOutputMode, buildCleanText } from './sanitize';
import { scanText } from './scan';

const entry = (patch: Partial<CloakMappingEntry>): CloakMappingEntry => ({
  ...emptyMappingEntry(`m-${patch.term ?? 'x'}`),
  ...patch,
});

const nirv = entry({ term: 'Nirv', replacement: 'SourceSystem', categoryLabel: 'Organization' });
const nirvSystem = entry({
  term: 'NirvSystem',
  replacement: 'SourceSystem',
  categoryLabel: 'Code Identifier',
});

function scanWith(text: string, entries: CloakMappingEntry[]) {
  return scanText(text, {
    enabledDetectorIds: [],
    extraDetectors: [createMappedTermsDetector(entries, 'Cloak mapping (Test)')],
  });
}

describe('validateMappingEntry', () => {
  it('accepts a plain term with an identifier replacement', () => {
    expect(validateMappingEntry(nirv)).toBeNull();
    expect(validateMappingEntry(entry({ term: 'Contoso', replacement: '' }))).toBeNull();
  });

  it('rejects short terms and non-identifier replacements', () => {
    expect(validateMappingEntry(entry({ term: 'N' }))).toMatch(/at least 2/);
    expect(validateMappingEntry(entry({ term: 'Nirv', replacement: 'has space' }))).toMatch(
      /identifier/,
    );
    expect(validateMappingEntry(entry({ term: 'a\nb' }))).toMatch(/line breaks/);
  });

  it('deduplicates by term and sorts longest first', () => {
    const list = usableMappings([nirv, entry({ term: 'nirv' }), nirvSystem]);
    expect(list.map((e) => e.term)).toEqual(['NirvSystem', 'Nirv']);
  });
});

describe('portfolio-code replacements', () => {
  it('replaces identifiers with case-adapted generic names', () => {
    const text = [
      '$NirvSystemID = Get-Item',
      'Enable-NIRVAccount -User $u',
      '$objUser.NirvAccess = $true',
      '$nirvSystemId = 7',
    ].join('\n');
    const findings = applyOutputMode(scanWith(text, [nirvSystem, nirv]), 'portfolio-code');
    const cleaned = buildCleanText(text, findings);
    expect(cleaned).toBe(
      [
        '$SourceSystemID = Get-Item',
        'Enable-SourceSystemAccount -User $u',
        '$objUser.SourceSystemAccess = $true',
        '$sourceSystemId = 7',
      ].join('\n'),
    );
  });

  it('keeps bracket placeholders in safe-share mode', () => {
    const text = '$NirvSystemID = 4';
    const findings = applyOutputMode(scanWith(text, [nirvSystem]), 'safe-share');
    expect(buildCleanText(text, findings)).toBe('$[CUSTOM_TERM_1]ID = 4');
  });

  it('keeps bracket placeholders inside string literals in both modes', () => {
    const text = `$path = 'C:\\Jobs\\NirvExport.csv'`;
    const findings = applyOutputMode(scanWith(text, [nirv]), 'portfolio-code');
    expect(buildCleanText(text, findings)).toContain('[CUSTOM_TERM_1]Export.csv');
  });

  it('keeps stable replacements for repeated identical terms', () => {
    const text = '$NirvA = 1; $NirvB = $NirvA';
    const findings = scanWith(text, [nirv]);
    expect(new Set(findings.map((f) => f.placeholder)).size).toBe(1);
    const cleaned = buildCleanText(text, applyOutputMode(findings, 'portfolio-code'));
    expect(cleaned).toBe('$SourceSystemA = 1; $SourceSystemB = $SourceSystemA');
  });

  it('applies per-entry category and severity to findings', () => {
    const findings = scanWith('$NirvSystemLog = 1', [
      entry({
        term: 'NirvSystem',
        replacement: 'SourceSystem',
        categoryLabel: 'Code Identifier',
        severity: 'low',
      }),
    ]);
    expect(findings[0].category).toBe('code');
    expect(findings[0].severity).toBe('low');
  });

  it('respects match modes', () => {
    const exact = scanWith('nirv and Nirv', [
      entry({ term: 'Nirv', matchMode: 'literal' }),
    ]);
    expect(exact).toHaveLength(1);

    const word = scanWith('NirvAccess and Nirv', [
      entry({ term: 'Nirv', matchMode: 'word' }),
    ]);
    expect(word).toHaveLength(1);
    expect(word[0].start).toBe('NirvAccess and '.length);
  });
});

describe('replacement precedence', () => {
  it('emails, URLs, and secrets beat mapped terms inside them', () => {
    const text = 'mail nirv.admin@example.com and https://nirv.example.internal/app';
    const findings = scanText(text, {
      extraDetectors: [createMappedTermsDetector([nirv])],
    });
    const ids = findings.map((f) => f.detectorId);
    expect(ids).toContain('email');
    expect(ids).toContain('internal-url');
    expect(ids).not.toContain('cloak-mapping');
  });

  it('longer mapped matches win over shorter overlapping ones', () => {
    const findings = scanWith('$NirvSystemID = 1', [nirv, nirvSystem]);
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('NirvSystem');
  });

  it('never corrupts protected regex strings', () => {
    const text = `$clean = $name -replace '[^a-zA-Z0-9]', ''`;
    const findings = scanText(text, {
      extraDetectors: [
        createMappedTermsDetector([entry({ term: 'a-zA-Z0-9', matchMode: 'ci-literal' })]),
      ],
    });
    expect(buildCleanText(text, findings)).toBe(text);
  });
});
