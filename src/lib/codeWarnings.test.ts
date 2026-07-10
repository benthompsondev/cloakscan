import { describe, expect, it } from 'vitest';
import { findCodeWarnings } from './codeWarnings';

describe('findCodeWarnings', () => {
  it('flags placeholders in variable, member, function, and param position', () => {
    const text = [
      '$[ORG_TERM_1] = 4',
      '$objUser.[ORG_TERM_2] = $true',
      'function [ORG_TERM_1] { }',
      'param([string]$[ORG_TERM_3])',
    ].join('\n');
    const warnings = findCodeWarnings(text);
    expect(warnings.map((w) => w.line)).toEqual([1, 2, 3, 4]);
    expect(warnings[0].reason).toMatch(/variable/);
    expect(warnings[1].reason).toMatch(/property or member/);
    expect(warnings[2].reason).toMatch(/function name/);
    expect(warnings[3].reason).toMatch(/parameter name/);
  });

  it('flags a placeholder used like a command with a parameter', () => {
    const warnings = findCodeWarnings('[ORG_TERM_1] -FirstName $first');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toMatch(/command/);
  });

  it('flags placeholders spliced inside identifiers', () => {
    const warnings = findCodeWarnings('Enable-[ORG_TERM_1]Account -User $u');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toMatch(/middle of an identifier/);
  });

  it('stays quiet for ordinary safe-share output', () => {
    const text = [
      'Contact [EMAIL_1] about server [INTERNAL_HOST_1].',
      'token=[API_KEY_1]',
      '$path = "[UNC_PATH_1]"',
      'Copy-Item -Path [WINDOWS_PATH_1]',
    ].join('\n');
    // Copy-Item -Path [X] is a placeholder as an argument VALUE, which is
    // fine; only "[X] -Param" (placeholder as the command itself) warns.
    expect(findCodeWarnings(text)).toEqual([]);
  });

  it('reports each location once with the most specific reason', () => {
    // $[X] also matches the mid-identifier pattern; only the variable
    // warning should be reported for that span.
    const warnings = findCodeWarnings('$[ORG_TERM_1] = 1');
    expect(warnings).toHaveLength(1);
    expect(warnings[0].reason).toMatch(/variable/);
  });

  it('includes a usable snippet without leaking beyond the line', () => {
    const [warning] = findCodeWarnings('$x = 1\n$[ORG_TERM_1].Value = 2\n$y = 3');
    expect(warning.line).toBe(2);
    expect(warning.snippet).toBe('$[ORG_TERM_1].Value = 2');
  });
});
