import { describe, expect, it } from 'vitest';
import { candidateKey, findCloakCandidates } from './candidates';
import type { Finding } from './types';

function coveredFinding(text: string, value: string): Finding {
  const start = text.indexOf(value);
  return {
    id: 'covered',
    detectorId: 'test',
    name: 'Covered value',
    category: 'personal',
    severity: 'medium',
    confidence: 'high',
    explanation: 'Synthetic test finding.',
    start,
    end: start + value.length,
    value,
    placeholder: '[NAME_1]',
    enabled: true,
  };
}

describe('findCloakCandidates', () => {
  it('suggests a repeated single Title-Case word', () => {
    const text = 'Alice approved the draft. Later, Alice reviewed the output.';
    expect(findCloakCandidates(text, [])).toEqual([
      { text: 'Alice', count: 2, firstStart: 0 },
    ]);
  });

  it('suggests a multi-token Title-Case run on its first appearance', () => {
    const text = 'Escalate the issue to Northwind Regional Health.';
    expect(findCloakCandidates(text, [])).toEqual([
      {
        text: 'Northwind Regional Health',
        count: 1,
        firstStart: text.indexOf('Northwind'),
      },
    ]);
  });

  it('keeps interior connectors in a suggested phrase', () => {
    const text = 'The file belongs to Bank of Northwind.';
    expect(findCloakCandidates(text, [])).toEqual([
      { text: 'Bank of Northwind', count: 1, firstStart: text.indexOf('Bank') },
    ]);
  });

  it('suggests a repeated 2-6 character acronym', () => {
    const text = 'NWRH opened the case. Send the result back to NWRH.';
    expect(findCloakCandidates(text, [])).toEqual([
      { text: 'NWRH', count: 2, firstStart: 0 },
    ]);
  });

  it('excludes cmdlets, calendar words, and one-off common words', () => {
    const text =
      'Run Get-Random on Monday in January. Review the output once before sharing.';
    expect(findCloakCandidates(text, [])).toEqual([]);
  });

  it('excludes candidates already covered by a finding', () => {
    const text = 'Owner: Alex Demo';
    expect(findCloakCandidates(text, [coveredFinding(text, 'Alex Demo')])).toEqual([]);
  });

  it('excludes candidates inside protected PowerShell regex ranges', () => {
    const text = "$matched = $name -match 'Northwind Regional Health'";
    expect(findCloakCandidates(text, [])).toEqual([]);
  });

  it('does not flood ordinary prose with guesses', () => {
    const text =
      'This is a short support note. The user opened the page and clicked save. ' +
      'Please review the cleaned text before sharing it with the team.';
    expect(findCloakCandidates(text, []).length).toBeLessThanOrEqual(2);
  });

  it('sorts by count then first position and deduplicates repeated phrases', () => {
    const text =
      'Northwind Health opened the case for NWRH. ' +
      'NWRH replied, then Northwind Health closed it.';
    expect(findCloakCandidates(text, [])).toEqual([
      { text: 'Northwind Health', count: 2, firstStart: 0 },
      { text: 'NWRH', count: 2, firstStart: text.indexOf('NWRH') },
    ]);
  });

  it('caps the review list at fifteen candidates', () => {
    const text = [
      'Alpha Birch',
      'Bravo Cedar',
      'Charlie Dogwood',
      'Delta Elm',
      'Echo Fir',
      'Foxtrot Hazel',
      'Golf Ironwood',
      'Hotel Juniper',
      'India Kapok',
      'Juliet Linden',
      'Kilo Maple',
      'Lima Nutmeg',
      'Mike Olive',
      'November Pine',
      'Oscar Redwood',
      'Papa Sycamore',
    ].join('\n');
    expect(findCloakCandidates(text, [])).toHaveLength(15);
  });

  it('removes dismissed terms and lets the next ranked suggestion into the list', () => {
    const text = [
      'Alpha Birch',
      'Bravo Cedar',
      'Charlie Dogwood',
      'Delta Elm',
      'Echo Fir',
      'Foxtrot Hazel',
      'Golf Ironwood',
      'Hotel Juniper',
      'India Kapok',
      'Juliet Linden',
      'Kilo Maple',
      'Lima Nutmeg',
      'Mike Olive',
      'November Pine',
      'Oscar Redwood',
      'Papa Sycamore',
    ].join('\n');
    const initial = findCloakCandidates(text, []);
    const dismissed = findCloakCandidates(text, [], [candidateKey('ALPHA BIRCH')]);

    expect(initial.map((candidate) => candidate.text)).not.toContain('Papa Sycamore');
    expect(dismissed).toHaveLength(15);
    expect(dismissed.map((candidate) => candidate.text)).not.toContain('Alpha Birch');
    expect(dismissed.map((candidate) => candidate.text)).toContain('Papa Sycamore');
  });

  it('keeps real names ahead of repeated PowerShell and logging noise', () => {
    const noisyTerms = [
      'Green',
      'Cyan',
      'Yellow',
      'Function',
      'Added',
      'Removed',
      'Updated',
      'Created',
      'Deleted',
      'Failed',
      'Error',
      'Warning',
      'Success',
      'Completed',
      'Starting',
      'ID',
      'AD',
      'CSV',
      'OU',
      'MMM',
    ];
    const noise = Array.from(
      { length: 14 },
      () => [...noisyTerms.map((term) => `Write-Output ${term}`), 'Write-Output End Date'].join('\n'),
    ).join('\n');
    const text = [
      noise,
      'Owner: Alex Demo',
      'Initiative: Project Nightjar',
      'Organization: Contoso Health',
      'Regulator: CPSO',
    ].join('\n');

    const candidates = findCloakCandidates(text, []);
    const candidateTexts = candidates.map((candidate) => candidate.text);

    expect(candidateTexts.slice(0, 3)).toEqual([
      'Alex Demo',
      'Project Nightjar',
      'Contoso Health',
    ]);
    expect(candidateTexts).toContain('CPSO');
    for (const junk of [
      'Green',
      'Cyan',
      'Yellow',
      'Function',
      'Added',
      'ID',
      'AD',
      'CSV',
      'OU',
      'MMM',
      'End Date',
    ]) {
      expect(candidateTexts).not.toContain(junk);
    }
  });

  it('excludes common privacy and infrastructure labels from the review panel', () => {
    const text = [
      'Cloak List',
      'NIC',
      'DOB',
      'SIN',
      'AWS',
      'Project Nightjar',
      'Contoso Health',
    ].join('\n');

    expect(findCloakCandidates(text, []).map((candidate) => candidate.text)).toEqual([
      'Project Nightjar',
      'Contoso Health',
    ]);
  });
});
