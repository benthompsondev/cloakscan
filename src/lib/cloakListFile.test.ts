import { describe, expect, it } from 'vitest';
import { parseCloakListFile, serializeCloakList } from './cloakListFile';
import { emptyPackTerms, type CustomPack } from './customPacks';
import { emptyMappingEntry } from './cloakMappings';

function sampleList(): CustomPack {
  const terms = emptyPackTerms();
  terms.values = ['Contoso Health', 'srv-app01'];
  terms.termLabel = 'ORG_TERM';
  terms.mappings = [
    {
      ...emptyMappingEntry('m-1'),
      term: 'Nirv',
      replacement: 'SourceSystem',
      categoryLabel: 'Code Identifier',
      severity: 'low',
    },
  ];
  return {
    id: 'pack-original',
    name: 'Org terms',
    description: 'Demo list',
    detectorIds: [],
    rules: [],
    terms,
    enabled: true,
  };
}

describe('serializeCloakList', () => {
  it('round-trips a list through export and import', () => {
    const json = serializeCloakList(sampleList());
    const result = parseCloakListFile(json);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pack.name).toBe('Org terms');
    expect(result.pack.terms.values).toEqual(['Contoso Health', 'srv-app01']);
    expect(result.pack.terms.termLabel).toBe('ORG_TERM');
    expect(result.pack.terms.mappings).toHaveLength(1);
    expect(result.pack.terms.mappings?.[0].term).toBe('Nirv');
    expect(result.pack.terms.mappings?.[0].replacement).toBe('SourceSystem');
  });

  it('contains only rule fields — no session or scan data keys exist', () => {
    const parsed = JSON.parse(serializeCloakList(sampleList()));
    expect(Object.keys(parsed).sort()).toEqual(
      [
        'kind',
        'version',
        'name',
        'description',
        'caseSensitive',
        'matchInsideWords',
        'termLabel',
        'terms',
        'mappings',
      ].sort(),
    );
    const flat = JSON.stringify(parsed).toLowerCase();
    for (const banned of ['sourcetext', 'finding', 'clipboard', 'cleantext', 'filename']) {
      expect(flat).not.toContain(banned);
    }
  });

  it('never exports the internal pack id or persistence opt-in', () => {
    const parsed = JSON.parse(serializeCloakList(sampleList()));
    expect(parsed.id).toBeUndefined();
    expect(parsed.saveTerms).toBeUndefined();
  });
});

describe('parseCloakListFile', () => {
  it('assigns a fresh id and starts session-only', () => {
    const result = parseCloakListFile(serializeCloakList(sampleList()));
    if (!result.ok) throw new Error(result.error);
    expect(result.pack.id).not.toBe('pack-original');
    expect(result.pack.terms.saveTerms).toBe(false);
  });

  it('fails safely on malformed input', () => {
    for (const bad of [
      'not json at all',
      '{}',
      '[]',
      JSON.stringify({ kind: 'something-else', version: 1 }),
      JSON.stringify({ kind: 'cloakscan.cloak-list', version: 99, name: 'x', terms: ['ab'] }),
      JSON.stringify({ kind: 'cloakscan.cloak-list', version: 1, name: '', terms: ['ab'] }),
      JSON.stringify({ kind: 'cloakscan.cloak-list', version: 1, name: 'Empty', terms: [] }),
    ]) {
      const result = parseCloakListFile(bad);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('drops malformed mapping entries but keeps valid ones', () => {
    const json = JSON.stringify({
      kind: 'cloakscan.cloak-list',
      version: 1,
      name: 'Mixed',
      terms: [],
      mappings: [
        { term: 'Nirv', replacement: 'SourceSystem' },
        { term: 'x' }, // too short
        { term: 'Bad', replacement: 'not valid!' }, // bad replacement -> cleaned to ''
        'not an object',
      ],
    });
    const result = parseCloakListFile(json);
    if (!result.ok) throw new Error(result.error);
    const mappings = result.pack.terms.mappings ?? [];
    expect(mappings.map((m) => m.term)).toEqual(['Nirv', 'Bad']);
    expect(mappings[1].replacement).toBe('');
  });

  it('ignores unknown fields instead of importing them', () => {
    const json = JSON.stringify({
      kind: 'cloakscan.cloak-list',
      version: 1,
      name: 'Sneaky',
      terms: ['contoso'],
      sourceText: 'should never import',
      findings: [{ value: 'x' }],
    });
    const result = parseCloakListFile(json);
    if (!result.ok) throw new Error(result.error);
    expect(JSON.stringify(result.pack)).not.toContain('should never import');
  });
});
