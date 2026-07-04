/**
 * Development-only harness: runs the real CloakGuard engine across a PRIVATE
 * local script corpus and prints AGGREGATE COUNTS ONLY.
 *
 * Hard privacy rules (do not relax):
 * - The corpus directory comes from CLOAKGUARD_PRIVATE_CORPUS; nothing is
 *   hardcoded. When the variable is absent the suite skips cleanly.
 * - The corpus is read-only. No file is modified, copied, or written anywhere.
 * - Matched values, file contents, and file names are NEVER printed. Output is
 *   limited to counts per detector/category and file totals.
 * - Errors are reported as generic counts so they cannot leak content.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { scanText } from '../src/lib/scan';
import { detectors } from '../src/lib/detectors';
import { decodeText } from '../src/lib/decodeText';
import { enabledRuleIds, profileRuleStates } from '../src/lib/profiles';

const corpusRoot = process.env.CLOAKGUARD_PRIVATE_CORPUS;

const SCRIPT_EXTENSIONS = new Set(['.ps1', '.psm1', '.psd1']);

interface CorpusFiles {
  files: string[];
  traversalFailures: number;
}

function collectScripts(dir: string, result: CorpusFiles = { files: [], traversalFailures: 0 }): CorpusFiles {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // Keep private paths and raw filesystem error messages out of test output.
    result.traversalFailures += 1;
    return result;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) collectScripts(full, result);
    else if (entry.isFile() && SCRIPT_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
      result.files.push(full);
    }
  }
  return result;
}

describe.skipIf(!corpusRoot)('private corpus aggregate scan', () => {
  it('scans every script under both profiles and reports aggregate counts only', () => {
    const { files, traversalFailures } = collectScripts(corpusRoot!);
    const profiles = {
      balanced: enabledRuleIds(profileRuleStates('balanced')),
      strict: enabledRuleIds(profileRuleStates('strict')),
    };

    interface Tally {
      byDetector: Map<string, number>;
      byCategory: Map<string, number>;
      filesWithNoDetections: number;
      totalMatches: number;
    }
    const tally = (): Tally => ({
      byDetector: new Map(),
      byCategory: new Map(),
      filesWithNoDetections: 0,
      totalMatches: 0,
    });
    const tallies: Record<'balanced' | 'strict', Tally> = { balanced: tally(), strict: tally() };

    let processed = 0;
    let decodeFailures = 0;
    let readFailures = 0;

    for (const file of files) {
      let buffer: Buffer;
      try {
        buffer = readFileSync(file);
      } catch {
        readFailures += 1; // generic count only — no path, no message
        continue;
      }
      const text = decodeText(new Uint8Array(buffer));
      if (text === null) {
        decodeFailures += 1;
        continue;
      }
      processed += 1;
      for (const profile of ['balanced', 'strict'] as const) {
        const findings = scanText(text, { enabledDetectorIds: profiles[profile] });
        const t = tallies[profile];
        if (findings.length === 0) t.filesWithNoDetections += 1;
        t.totalMatches += findings.length;
        for (const f of findings) {
          t.byDetector.set(f.detectorId, (t.byDetector.get(f.detectorId) ?? 0) + 1);
          t.byCategory.set(f.category, (t.byCategory.get(f.category) ?? 0) + 1);
        }
      }
    }

    const b = tallies.balanced;
    const s = tallies.strict;
    const categories = [...new Set([...b.byCategory.keys(), ...s.byCategory.keys()])].sort();
    const lines = [
      '=== CloakGuard private corpus — AGGREGATE COUNTS ONLY ===',
      `Files found:            ${files.length}`,
      `Files processed:        ${processed}`,
      `Traversal failures:     ${traversalFailures}`,
      `Read failures:          ${readFailures}`,
      `Decode failures:        ${decodeFailures}`,
      '',
      `${'profile'.padEnd(24)} ${'balanced'.padStart(9)} ${'strict'.padStart(9)}`,
      `${'Total matches'.padEnd(24)} ${String(b.totalMatches).padStart(9)} ${String(s.totalMatches).padStart(9)}`,
      `${'Files with 0 findings'.padEnd(24)} ${String(b.filesWithNoDetections).padStart(9)} ${String(s.filesWithNoDetections).padStart(9)}`,
      '--- by category ---',
      ...categories.map(
        (c) =>
          `${c.padEnd(24)} ${String(b.byCategory.get(c) ?? 0).padStart(9)} ${String(s.byCategory.get(c) ?? 0).padStart(9)}`,
      ),
      '--- by detector ---',
      ...detectors.map(
        (d) =>
          `${d.id.padEnd(24)} ${String(b.byDetector.get(d.id) ?? 0).padStart(9)} ${String(s.byDetector.get(d.id) ?? 0).padStart(9)}`,
      ),
    ];
    console.log(lines.join('\n'));

    expect(processed + decodeFailures + readFailures).toBe(files.length);
    expect(traversalFailures, 'One or more private corpus directories could not be read').toBe(0);
  });
});

describe.skipIf(!!corpusRoot)('private corpus harness (disabled)', () => {
  it('skips cleanly when CLOAKGUARD_PRIVATE_CORPUS is not set', () => {
    console.log('CLOAKGUARD_PRIVATE_CORPUS is not set — private corpus scan skipped.');
    expect(corpusRoot).toBeUndefined();
  });
});
