import { describe, expect, it } from 'vitest';
import { FUZZ_SEEDS, privacyFuzz, privacySyntaxFuzz } from '../test-fixtures/privacyFuzz';
import { scanText } from './scan';
import { applyOutputMode, buildCleanText } from './sanitize';
import { enabledRuleIds, MAXIMUM_PROFILE, resolveRuleStates } from './profiles';
import { buildPreviewSegments } from './segments';
import { privacyFuzzBenignRegressions, privacyFuzzRegressions } from '../test-fixtures/privacyFuzzRegressions';

const options = { enabledDetectorIds: enabledRuleIds(resolveRuleStates(MAXIMUM_PROFILE)) };
describe('seeded privacy grammar fuzzing', () => {
  it.each([...privacyFuzzRegressions, ...FUZZ_SEEDS.flatMap((seed) => [...privacyFuzz(seed), ...privacySyntaxFuzz(seed)])])('$name', ({ source, secret }) => {
    const findings = scanText(source, options);
    const start = source.indexOf(secret);
    expect(start).toBeGreaterThanOrEqual(0);
    let covered = start;
    for (const f of findings) {
      expect(source.slice(f.start, f.end)).toBe(f.value);
      if (f.enabled && f.start <= covered && f.end > covered) covered = f.end;
    }
    // Cover the representation itself, not merely its decoded full value.
    expect(covered, JSON.stringify({ source, secret })).toBeGreaterThanOrEqual(start + secret.length);
    for (const mode of ['safe-share', 'portfolio-code'] as const) {
      const effective = applyOutputMode(findings, mode);
      const output = buildCleanText(source, effective);
      expect(output).not.toContain(secret);
      expect(buildPreviewSegments(source, effective).map((s) => s.text).join('')).toBe(output);
      if (source.includes('status')) expect(output).toContain('status');
    }
  });
  it.each(FUZZ_SEEDS.flatMap((seed) => privacyFuzz(seed, 40, true)))('benign $name', ({ source }) => {
    const findings = scanText(source, options);
    expect(buildCleanText(source, findings), JSON.stringify({ source, findings })).toBe(source);
  });
  it.each(privacyFuzzBenignRegressions)('benign regression: %s', (source) => {
    expect(buildCleanText(source, scanText(source, options))).toBe(source);
  });
});
