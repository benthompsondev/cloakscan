import { describe, expect, it } from 'vitest';
import { benignMutations, boundaryMutations, fieldMutations } from '../test-fixtures/privacyMutations';
import { scanText } from './scan';
import { applyOutputMode, buildCleanText } from './sanitize';
import { enabledRuleIds, MAXIMUM_PROFILE, resolveRuleStates } from './profiles';
import { buildPreviewSegments } from './segments';
import { privacyCases } from '../test-fixtures/privacyAssurance';

const options = { enabledDetectorIds: enabledRuleIds(resolveRuleStates(MAXIMUM_PROFILE)) };

describe('deterministic privacy mutations', () => {
  it.each([...fieldMutations, ...boundaryMutations])('$name', ({ source, secret }) => {
    const findings = scanText(source, options);
    const start = source.indexOf(secret);
    expect(start).toBeGreaterThanOrEqual(0);
    let covered = start;
    for (const finding of findings) {
      expect(source.slice(finding.start, finding.end)).toBe(finding.value);
      if (finding.enabled && finding.start <= covered && finding.end > covered) covered = finding.end;
    }
    expect(covered, 'every character of the sensitive span must be covered').toBeGreaterThanOrEqual(start + secret.length);
    for (const mode of ['safe-share', 'portfolio-code'] as const) {
      const effective = applyOutputMode(findings, mode);
      const output = buildCleanText(source, effective);
      expect(output).not.toContain(secret);
      expect(buildPreviewSegments(source, effective).map((segment) => segment.text).join('')).toBe(output);
    }
    expect(scanText(source, options)).toEqual(findings); // no cross-call regex state
  });

  it.each(benignMutations)('preserves benign input: %s', (source) => {
    expect(buildCleanText(source, scanText(source, options))).toBe(source);
  });

  it.each(privacyCases)('preserves coverage in mixed Unicode context: $name', ({ source, hidden }) => {
    // Add a UTF-16 surrogate pair and detection-view trigger before every
    // existing category. Offset mapping must still cover every original span.
    const text = `🔒\u2009\n${source.replace(/\n/g, '\r\n')}\r\nstatus: ok`;
    const findings = scanText(text, options);
    for (const value of hidden) {
      const expected = value.replace(/\n/g, '\r\n');
      let start = text.indexOf(expected);
      expect(start).toBeGreaterThanOrEqual(0);
      while (start !== -1) {
        let end = start;
        for (const f of findings) {
          if (f.enabled && f.start <= end && f.end > end) end = f.end;
        }
        expect(end, expected).toBeGreaterThanOrEqual(start + expected.length);
        start = text.indexOf(expected, start + expected.length);
      }
    }
    for (const mode of ['safe-share', 'portfolio-code'] as const) {
      const output = buildCleanText(text, applyOutputMode(findings, mode));
      expect(output).toMatch(/^🔒\u2009\r?\n/);
      expect(output).toContain('status: ok');
    }
  });
});
