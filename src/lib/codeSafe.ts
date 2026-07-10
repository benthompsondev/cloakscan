/**
 * Code-safe replacement support for Portfolio-code mode.
 *
 * Safe-share mode replaces every enabled finding with a bracket placeholder.
 * That is right for prompts and tickets, but inside PowerShell it can turn
 * `Enable-NirvAccount` into `Enable-[ORG_TERM_1]Account`, which no longer
 * reads (or runs) as code. Portfolio-code mode swaps a mapped custom term for
 * a generic, syntactically valid identifier instead — but ONLY when the match
 * sits in identifier position. String literals, prose, and standalone words
 * keep their bracket placeholders.
 *
 * Everything here is pure string analysis. Nothing is executed and nothing
 * leaves memory.
 */

export interface StringRange {
  start: number;
  end: number;
}

const WORD_CHAR_RE = /[A-Za-z0-9_]/;

/** Identifier replacements: letters, digits, underscores, hyphens only. */
export const REPLACEMENT_IDENTIFIER_RE = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;

/**
 * Find single- and double-quoted PowerShell string literal ranges (contents
 * only, quotes excluded). Handles '' escapes in single quotes and backtick
 * escapes in double quotes. Comments are skipped so a quote inside `# ...`
 * never opens a string. Deliberately small — not a full PowerShell parser.
 */
export function findPowerShellStringRanges(text: string): StringRange[] {
  const ranges: StringRange[] = [];
  let quote: "'" | '"' | null = null;
  let contentStart = 0;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quote === "'") {
      if (char === "'" && text[i + 1] === "'") {
        i += 1;
      } else if (char === "'") {
        ranges.push({ start: contentStart, end: i });
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (char === '`') {
        i += 1;
      } else if (char === '"') {
        ranges.push({ start: contentStart, end: i });
        quote = null;
      }
      continue;
    }
    if (char === '#') {
      // Line comment: skip to end of line so quotes in comments stay inert.
      while (i < text.length && text[i] !== '\n') i += 1;
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
      contentStart = i + 1;
    }
  }
  // An unterminated string still protects everything after the open quote.
  if (quote !== null) ranges.push({ start: contentStart, end: text.length });
  return ranges;
}

export function isInsideStringLiteral(
  ranges: readonly StringRange[],
  start: number,
  end: number,
): boolean {
  return ranges.some((r) => start >= r.start && end <= r.end);
}

/**
 * Whether the match occupies identifier position: embedded in a longer
 * identifier token, a $variable, a .member access, part of a Verb-Noun
 * command, or the name right after the function/filter/class keyword.
 */
export function isIdentifierContext(text: string, start: number, end: number): boolean {
  const before = text[start - 1] ?? '';
  const after = text[end] ?? '';

  // Embedded inside a larger token: NirvAccess, SamNirv, NIRV_DB.
  if (WORD_CHAR_RE.test(before) || WORD_CHAR_RE.test(after)) return true;
  // Variable: $Nirv
  if (before === '$') return true;
  // Member access: $objUser.Nirv (needs a token before the dot, not ./path)
  if (before === '.' && /[A-Za-z0-9_)\]]/.test(text[start - 2] ?? '')) return true;
  // Verb-Noun command tail or head: Enable-Nirv / Nirv-Enable
  if (before === '-' && WORD_CHAR_RE.test(text[start - 2] ?? '')) return true;
  if (after === '-' && WORD_CHAR_RE.test(text[end + 1] ?? '')) return true;
  // Declared name: function Nirv { ... }
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  if (/(?:function|filter|workflow|class)\s+$/i.test(text.slice(lineStart, start))) return true;
  return false;
}

/** PascalCase/camelCase to UPPER_SNAKE: SourceSystem -> SOURCE_SYSTEM. */
function toUpperSnake(identifier: string): string {
  return identifier.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toUpperCase();
}

/**
 * Adapt the replacement's casing to the matched value's casing so the result
 * still reads like the surrounding code:
 *   NIRV_SYSTEM_ID       -> SOURCE_SYSTEM_ID (snake context: UPPER_SNAKE)
 *   Enable-NIRVAccount   -> Enable-SourceSystemAccount (acronym inside Pascal)
 *   nirvSystemId         -> sourceSystemId (camel: first letter lowered)
 *   NirvSystemID         -> SourceSystemID (Pascal: as written)
 *
 * `before`/`after` are the characters adjacent to the match: an all-caps
 * match embedded directly against other letters is an acronym inside a
 * Pascal identifier, not snake case.
 */
export function adaptReplacementCase(
  matched: string,
  replacement: string,
  before = '',
  after = '',
): string {
  const letters = matched.replace(/[^A-Za-z]/g, '');
  if (letters.length >= 2 && letters === letters.toUpperCase()) {
    const embeddedInLetters = /[A-Za-z]/.test(before) || /[A-Za-z]/.test(after);
    return embeddedInLetters ? replacement : toUpperSnake(replacement);
  }
  const firstLetter = /[A-Za-z]/.exec(matched)?.[0];
  if (firstLetter && firstLetter === firstLetter.toLowerCase()) {
    return replacement.charAt(0).toLowerCase() + replacement.slice(1);
  }
  return replacement;
}

/**
 * The code-safe replacement for one match, or null when a bracket placeholder
 * is the right output (no replacement configured, not identifier position, or
 * inside a string literal).
 */
export function codeSafeReplacementFor(
  text: string,
  start: number,
  end: number,
  replacement: string,
  stringRanges: readonly StringRange[],
): string | null {
  if (!REPLACEMENT_IDENTIFIER_RE.test(replacement)) return null;
  if (isInsideStringLiteral(stringRanges, start, end)) return null;
  if (!isIdentifierContext(text, start, end)) return null;
  return adaptReplacementCase(
    text.slice(start, end),
    replacement,
    text[start - 1] ?? '',
    text[end] ?? '',
  );
}
