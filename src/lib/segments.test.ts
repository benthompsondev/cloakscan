import { describe, expect, it } from 'vitest';
import { scanText } from './scan';
import { buildCleanText } from './sanitize';
import { buildPreviewSegments, buildSourceSegments, segmentsToLines } from './segments';
import { groupFindings, setFindingsEnabled } from './groups';
import { DEMO_TEXT } from './demo';
import { SYNTHETIC_STRIPE_SHAPED_KEY } from './synthetic';

const joined = (segments: { text: string }[]) => segments.map((s) => s.text).join('');

describe('source segments', () => {
  it('reassemble to the original text exactly', () => {
    const findings = scanText(DEMO_TEXT);
    expect(joined(buildSourceSegments(DEMO_TEXT, findings))).toBe(DEMO_TEXT);
  });

  it('mark each finding as a match segment', () => {
    const text = 'mail a@example.internal from 10.0.0.5';
    const segments = buildSourceSegments(text, scanText(text));
    const matches = segments.filter((s) => s.kind === 'match');
    expect(matches.map((s) => s.text)).toEqual(['a@example.internal', '10.0.0.5']);
    expect(matches.map((s) => s.category)).toEqual(['personal', 'infrastructure']);
  });
});

describe('preview segments', () => {
  it('reassemble to exactly buildCleanText, including disabled findings', () => {
    let findings = scanText(DEMO_TEXT);
    // Disable a couple of findings to exercise the kept-as-is path.
    findings = setFindingsEnabled(findings, [findings[0].id, findings[3].id], false);
    expect(joined(buildPreviewSegments(DEMO_TEXT, findings))).toBe(
      buildCleanText(DEMO_TEXT, findings),
    );
  });

  it('emit placeholder segments only for enabled findings', () => {
    const text = 'mail a@example.internal from 10.0.0.5';
    let findings = scanText(text);
    findings = setFindingsEnabled(findings, [findings[0].id], false);
    const segments = buildPreviewSegments(text, findings);
    const placeholders = segments.filter((s) => s.kind === 'placeholder');
    expect(placeholders.map((s) => s.text)).toEqual(['[IP_ADDRESS_1]']);
    expect(joined(segments)).toContain('a@example.internal');
  });
});

describe('segmentsToLines', () => {
  it('splits on newlines and preserves content', () => {
    const text = 'one 10.0.0.5\ntwo\n\nthree';
    const lines = segmentsToLines(buildSourceSegments(text, scanText(text)));
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => joined(line))).toEqual(['one 10.0.0.5', 'two', '', 'three']);
  });

  it('keeps \r attached so CRLF content round-trips', () => {
    const text = 'a\r\nb';
    const lines = segmentsToLines(buildSourceSegments(text, []));
    expect(lines.map((line) => joined(line))).toEqual(['a\r', 'b']);
  });
});

describe('grouping', () => {
  it('groups repeated identical values with a count', () => {
    const text = 'a@example.internal then b@example.internal then a@example.internal';
    const groups = groupFindings(scanText(text));
    expect(groups).toHaveLength(2);
    const repeated = groups.find((g) => g.value === 'a@example.internal')!;
    expect(repeated.count).toBe(2);
    expect(repeated.ids).toHaveLength(2);
  });

  it('sorts by severity, high first', () => {
    const text = `api_key=${SYNTHETIC_STRIPE_SHAPED_KEY} log C:\\Users\\ademo\\x.log`;
    const groups = groupFindings(scanText(text));
    expect(groups.map((g) => g.severity)).toEqual(['high', 'low']);
  });

  it('toggles every occurrence in a group together', () => {
    const text = 'a@example.internal cc a@example.internal';
    let findings = scanText(text);
    const group = groupFindings(findings)[0];
    findings = setFindingsEnabled(findings, group.ids, false);
    expect(findings.every((f) => !f.enabled)).toBe(true);
    expect(groupFindings(findings)[0].enabled).toBe(false);
  });
});
