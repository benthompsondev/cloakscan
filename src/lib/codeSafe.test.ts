import { describe, expect, it } from 'vitest';
import {
  adaptReplacementCase,
  codeSafeReplacementFor,
  findPowerShellStringRanges,
  isIdentifierContext,
  isInsideStringLiteral,
} from './codeSafe';

describe('findPowerShellStringRanges', () => {
  it('finds single- and double-quoted literal contents', () => {
    const text = `$a = 'one' + "two"`;
    const ranges = findPowerShellStringRanges(text);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['one', 'two']);
  });

  it('handles doubled single-quote escapes', () => {
    const text = `$s = 'it''s fine' ; $x = 1`;
    const [range] = findPowerShellStringRanges(text);
    expect(text.slice(range.start, range.end)).toBe("it''s fine");
  });

  it('handles backtick escapes in double quotes', () => {
    const text = '$s = "say `"hi`" now" ; $x = 1';
    const [range] = findPowerShellStringRanges(text);
    expect(text.slice(range.start, range.end)).toBe('say `"hi`" now');
  });

  it('ignores quotes inside comments', () => {
    const text = "# don't panic\n$a = 'real'";
    const ranges = findPowerShellStringRanges(text);
    expect(ranges.map((r) => text.slice(r.start, r.end))).toEqual(['real']);
  });

  it('protects everything after an unterminated quote', () => {
    const ranges = findPowerShellStringRanges(`$a = "broken`);
    expect(ranges).toHaveLength(1);
    expect(isInsideStringLiteral(ranges, 7, 12)).toBe(true);
  });
});

describe('isIdentifierContext', () => {
  const at = (text: string, term: string) => {
    const start = text.indexOf(term);
    return isIdentifierContext(text, start, start + term.length);
  };

  it('is true when embedded in a longer identifier', () => {
    expect(at('$user.NirvAccess', 'Nirv')).toBe(true);
    expect(at('NirvScriptLog written', 'Nirv')).toBe(true);
    expect(at('SamNirv = 1', 'Nirv')).toBe(true);
  });

  it('is true for variables, members, and Verb-Noun commands', () => {
    expect(at('$Nirv = 1', 'Nirv')).toBe(true);
    expect(at('$objUser.Nirv', 'Nirv')).toBe(true);
    expect(at('Enable-Nirv $user', 'Nirv')).toBe(true);
    expect(at('Nirv-Enable $user', 'Nirv')).toBe(true);
  });

  it('is true right after the function keyword', () => {
    expect(at('function Nirv { }', 'Nirv')).toBe(true);
  });

  it('is false for standalone prose words and path-relative dots', () => {
    expect(at('the Nirv rollout starts', 'Nirv')).toBe(false);
    expect(at('run ./Nirv now', 'Nirv')).toBe(false);
  });
});

describe('adaptReplacementCase', () => {
  it('keeps the replacement as written for Pascal/mixed case matches', () => {
    expect(adaptReplacementCase('NirvSystem', 'SourceSystem')).toBe('SourceSystem');
    expect(adaptReplacementCase('Nirv', 'SourceSystem')).toBe('SourceSystem');
  });

  it('lowers the first letter for camelCase matches', () => {
    expect(adaptReplacementCase('nirvSystem', 'SourceSystem')).toBe('sourceSystem');
    expect(adaptReplacementCase('nirv', 'SourceSystem')).toBe('sourceSystem');
  });

  it('converts to UPPER_SNAKE for standalone all-caps matches', () => {
    expect(adaptReplacementCase('NIRV', 'SourceSystem')).toBe('SOURCE_SYSTEM');
    expect(adaptReplacementCase('NIRV_SYSTEM', 'SourceSystem', '$', '_')).toBe('SOURCE_SYSTEM');
  });

  it('keeps the replacement as written for acronyms embedded in Pascal identifiers', () => {
    expect(adaptReplacementCase('NIRV', 'SourceSystem', '-', 'A')).toBe('SourceSystem');
  });
});

describe('codeSafeReplacementFor', () => {
  const forText = (text: string, term: string, replacement = 'SourceSystem') => {
    const start = text.indexOf(term);
    return codeSafeReplacementFor(
      text,
      start,
      start + term.length,
      replacement,
      findPowerShellStringRanges(text),
    );
  };

  it('returns an adapted identifier in identifier position', () => {
    expect(forText('$NirvSystemID = 4', 'Nirv')).toBe('SourceSystem');
    expect(forText('Enable-NIRVAccount $u', 'NIRV')).toBe('SourceSystem');
  });

  it('returns null inside string literals', () => {
    expect(forText(`$name = 'NirvExport.csv'`, 'Nirv')).toBeNull();
  });

  it('returns null outside identifier position', () => {
    expect(forText('deployed for Nirv today', 'Nirv')).toBeNull();
  });

  it('returns null for a replacement that is not a plain identifier', () => {
    expect(forText('$NirvID = 4', 'Nirv', 'bad value!')).toBeNull();
  });
});
