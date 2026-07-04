/** A source range that detectors must leave untouched. */
export interface ProtectedRange {
  start: number;
  end: number;
}

const BINARY_REGEX_RE =
  /(?:-replace|-match|-notmatch)\s+('(?:''|[^'\r\n])*'|"(?:`.|[^"\r\n])*")/gi;
const SELECT_STRING_PATTERN_RE =
  /\bSelect-String\b[^\r\n;|]*?-Pattern\s+('(?:''|[^'\r\n])*'|"(?:`.|[^"\r\n])*")/gi;
const STATIC_REGEX_CALL_RE =
  /\[regex\]::(?:Match|Matches|Replace)\s*\(\s*[^,\r\n]+,\s*('(?:''|[^'\r\n])*'|"(?:`.|[^"\r\n])*")/gi;
const SWITCH_REGEX_START_RE = /\bswitch\s+-Regex\b[^{\r\n]*\{/gi;
const SWITCH_CASE_RE = /^\s*('(?:''|[^'\r\n])*'|"(?:`.|[^"\r\n])*")\s*\{/gim;

function captureRange(match: RegExpExecArray, group = 1, baseOffset = 0): ProtectedRange | null {
  const value = match[group];
  if (!value) return null;
  const offset = match[0].lastIndexOf(value);
  if (offset < 0) return null;
  const start = baseOffset + match.index + offset;
  return { start, end: start + value.length };
}

function collectCapturedRanges(text: string, pattern: RegExp, baseOffset = 0): ProtectedRange[] {
  const ranges: ProtectedRange[] = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const range = captureRange(match, 1, baseOffset);
    if (range) ranges.push(range);
    if (match[0].length === 0) re.lastIndex += 1;
  }
  return ranges;
}

/**
 * Find the closing brace for a PowerShell block while ignoring braces inside
 * ordinary quoted strings. This is intentionally small, not a PowerShell
 * parser; it only supports locating switch -Regex case patterns safely.
 */
function findClosingBrace(text: string, openingBrace: number): number {
  let depth = 0;
  let quote: "'" | '"' | null = null;

  for (let index = openingBrace; index < text.length; index += 1) {
    const char = text[index];
    if (quote === "'") {
      if (char === "'" && text[index + 1] === "'") {
        index += 1;
      } else if (char === "'") {
        quote = null;
      }
      continue;
    }
    if (quote === '"') {
      if (char === '`') {
        index += 1;
      } else if (char === '"') {
        quote = null;
      }
      continue;
    }
    if (char === "'" || char === '"') {
      quote = char;
    } else if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return text.length;
}

/**
 * PowerShell regex strings are executable syntax, not source data. Protect
 * them before detectors run so broad patterns cannot corrupt character
 * classes, ticket-like fragments, or literal match expressions.
 */
export function findPowerShellRegexRanges(text: string): ProtectedRange[] {
  const ranges = [
    ...collectCapturedRanges(text, BINARY_REGEX_RE),
    ...collectCapturedRanges(text, SELECT_STRING_PATTERN_RE),
    ...collectCapturedRanges(text, STATIC_REGEX_CALL_RE),
  ];

  const switchRe = new RegExp(SWITCH_REGEX_START_RE.source, SWITCH_REGEX_START_RE.flags);
  let switchMatch: RegExpExecArray | null;
  while ((switchMatch = switchRe.exec(text)) !== null) {
    const openingBrace = switchMatch.index + switchMatch[0].lastIndexOf('{');
    const closingBrace = findClosingBrace(text, openingBrace);
    const blockStart = openingBrace + 1;
    ranges.push(
      ...collectCapturedRanges(
        text.slice(blockStart, closingBrace),
        SWITCH_CASE_RE,
        blockStart,
      ),
    );
    switchRe.lastIndex = Math.max(switchRe.lastIndex, closingBrace + 1);
  }

  const unique = new Map(ranges.map((range) => [`${range.start}:${range.end}`, range]));
  return [...unique.values()].sort((a, b) => a.start - b.start);
}
