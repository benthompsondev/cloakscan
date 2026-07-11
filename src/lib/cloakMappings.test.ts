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
    expect(
      validateMappingEntry(entry({ term: 'Contoso', replacement: '', strategy: 'placeholder' })),
    ).toBeNull();
  });

  it('requires a replacement for the code-only and genericize strategies', () => {
    expect(validateMappingEntry(entry({ term: 'Contoso', replacement: '' }))).toMatch(
      /needs a replacement/,
    );
    expect(
      validateMappingEntry(entry({ term: 'Contoso', replacement: '', strategy: 'genericize' })),
    ).toMatch(/needs a replacement/);
    expect(
      validateMappingEntry(entry({ term: 'Contoso', replacement: '', strategy: 'review-lead' })),
    ).toBeNull();
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
      entry({ term: 'Nirv', matchMode: 'literal', strategy: 'placeholder' }),
    ]);
    expect(exact).toHaveLength(1);

    const word = scanWith('NirvAccess and Nirv', [
      entry({ term: 'Nirv', matchMode: 'word', strategy: 'placeholder' }),
    ]);
    expect(word).toHaveLength(1);
    expect(word[0].start).toBe('NirvAccess and '.length);
  });
});

describe('replacement strategies', () => {
  it('placeholder strategy never swaps in the replacement, even in portfolio-code', () => {
    const text = '$NirvId = 1; # Nirv export';
    const findings = applyOutputMode(
      scanWith(text, [
        entry({ term: 'Nirv', replacement: 'SourceSystem', strategy: 'placeholder' }),
      ]),
      'portfolio-code',
    );
    const cleaned = buildCleanText(text, findings);
    expect(cleaned).not.toContain('SourceSystem');
    expect(cleaned).toContain('[CUSTOM_TERM_1]');
  });

  it('genericize strategy replaces in prose and strings too', () => {
    const text = ["$NirvId = 1", "Write-Output 'Nirv sync done'", '# Nirv handoff'].join('\n');
    const findings = applyOutputMode(
      scanWith(text, [
        entry({ term: 'Nirv', replacement: 'SourceSystem', strategy: 'genericize' }),
      ]),
      'portfolio-code',
    );
    const cleaned = buildCleanText(text, findings);
    expect(cleaned).toBe(
      ['$SourceSystemId = 1', "Write-Output 'SourceSystem sync done'", '# SourceSystem handoff'].join(
        '\n',
      ),
    );
  });

  it('genericize still uses placeholders in safe-share mode', () => {
    const text = '# Nirv handoff';
    const findings = applyOutputMode(
      scanWith(text, [
        entry({ term: 'Nirv', replacement: 'SourceSystem', strategy: 'genericize' }),
      ]),
      'safe-share',
    );
    expect(buildCleanText(text, findings)).toBe('# [CUSTOM_TERM_1] handoff');
  });

  it('review-lead strategy starts disabled and never rewrites output', () => {
    const text = '$NirvId = 1';
    const findings = scanWith(text, [
      entry({ term: 'Nirv', replacement: '', strategy: 'review-lead' }),
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].reviewLead).toBe(true);
    expect(findings[0].enabled).toBe(false);
    expect(buildCleanText(text, applyOutputMode(findings, 'portfolio-code'))).toBe(text);
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

  // Direct precedence checks: a mapped term embedded in a larger sensitive
  // value must lose to the full value, one case per built-in family.
  const precedenceCases: { name: string; text: string; term: string; winner: string }[] = [
    {
      name: 'GUID',
      text: 'Correlation 4de1cbb2-89ab-4cde-9012-3456789abcde logged.',
      term: 'cbb2',
      winner: 'guid-identifier',
    },
    {
      name: 'IPv4 address',
      text: 'Ping 203.0.113.42 before retrying.',
      term: '113',
      winner: 'ipv4',
    },
    {
      name: 'internal hostname',
      text: 'Deploy lands on nirv-app01.corp.example tonight.',
      term: 'nirv',
      winner: 'internal-hostname',
    },
    {
      name: 'internal URL',
      text: 'Docs sit at https://nirv.example.internal/runbook today.',
      term: 'nirv',
      winner: 'internal-url',
    },
    {
      name: 'UNC path',
      text: String.raw`Copy from \\nirv-fs01\share\export.csv now.`,
      term: 'nirv',
      winner: 'unc-path',
    },
    {
      name: 'user file path',
      text: String.raw`Log written to C:\Users\nirvadmin\out.log already.`,
      term: 'nirv',
      winner: 'windows-user-path',
    },
    {
      name: 'credential-bearing connection string',
      text: 'Server=nirv-sql01;Database=app;User Id=svc_app;Password=Fake1234!;',
      term: 'nirv',
      winner: 'connection-string',
    },
  ];

  for (const { name, text, term, winner } of precedenceCases) {
    it(`${name} beats a mapped term inside it`, () => {
      const findings = scanText(text, {
        extraDetectors: [
          createMappedTermsDetector([
            entry({ term, replacement: 'SourceSystem', categoryLabel: 'Organization' }),
          ]),
        ],
      });
      const ids = findings.map((f) => f.detectorId);
      expect(ids, `${name} detector should fire`).toContain(winner);
      expect(ids, 'mapped term must lose the overlap').not.toContain('cloak-mapping');
    });
  }

  it('longer mapped matches win over shorter overlapping ones', () => {
    const findings = scanWith('$NirvSystemID = 1', [nirv, nirvSystem]);
    expect(findings).toHaveLength(1);
    expect(findings[0].value).toBe('NirvSystem');
  });

  it('never corrupts protected regex strings', () => {
    const text = `$clean = $name -replace '[^a-zA-Z0-9]', ''`;
    const findings = scanText(text, {
      extraDetectors: [
        createMappedTermsDetector([
          entry({ term: 'a-zA-Z0-9', matchMode: 'ci-literal', strategy: 'placeholder' }),
        ]),
      ],
    });
    expect(buildCleanText(text, findings)).toBe(text);
  });
});
