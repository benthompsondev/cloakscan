import { describe, expect, it } from 'vitest';
import { privacyCases, benignCases } from '../test-fixtures/privacyAssurance';
import { scanText } from './scan';
import { applyOutputMode, buildCleanText } from './sanitize';
import { enabledRuleIds, MAXIMUM_PROFILE, resolveRuleStates } from './profiles';

const options = { enabledDetectorIds: enabledRuleIds(resolveRuleStates(MAXIMUM_PROFILE)) };

describe('synthetic privacy assurance through scan and output', () => {
  it.each(privacyCases)('$name', ({ source, hidden, kept = [] }) => {
    const findings = scanText(source, options);
    for (const mode of ['safe-share', 'portfolio-code'] as const) {
      const output = buildCleanText(source, applyOutputMode(findings, mode));
      for (const value of hidden) {
        expect(value.length).toBeGreaterThan(0);
        expect(output, `residual ${value}`).not.toContain(value);
        // Absence of the whole string alone misses partial redactions. Prove
        // every character of each sensitive span is covered by enabled findings.
        let at = source.indexOf(value);
        expect(at).toBeGreaterThanOrEqual(0);
        while (at !== -1) {
          let covered = at;
          for (const finding of findings.filter((f) => f.enabled)) {
            if (finding.start <= covered && finding.end > covered) covered = finding.end;
          }
          expect(covered, `partial coverage of ${value}`).toBeGreaterThanOrEqual(at + value.length);
          at = source.indexOf(value, at + value.length);
        }
      }
      for (const value of kept) expect(output).toContain(value);
    }
    for (const finding of findings) {
      expect(source.slice(finding.start, finding.end)).toBe(finding.value);
    }
  });

  it.each(benignCases)('preserves technical text: %s', (source) => {
    expect(buildCleanText(source, scanText(source, options))).toBe(source);
  });
});
