/**
 * Invalid-code warnings: spot places where a bracket placeholder landed in
 * identifier position, so the sanitized output no longer reads as valid
 * PowerShell (e.g. `$[ORG_TERM_1]` or `function [ORG_TERM_1]`). These are
 * hints for the user to add a code-safe Cloak List mapping or keep that
 * finding as-is — they never block copying or downloading the output.
 */

export interface CodeWarning {
  /** 1-based line number in the sanitized output. */
  line: number;
  /** Short excerpt around the problem (sanitized text only — safe to show). */
  snippet: string;
  reason: string;
}

/** A placeholder token in any of the built-in formats, e.g. [ORG_TERM_1]. */
const PLACEHOLDER = String.raw`\[[A-Z][A-Z0-9_]*(?:_\d+)?\]`;

// Most specific first: overlapping hits are claimed by the earliest pattern,
// so param(...) must outrank the bare $[…] shape it contains.
const WARNING_PATTERNS: { re: RegExp; reason: string }[] = [
  // Keywords are matched with explicit casing (not the i flag) so the
  // placeholder shape itself stays case-sensitive — otherwise a type
  // accelerator like [string] would read as a placeholder.
  {
    re: new RegExp(String.raw`[pP]aram\s*\(\s*(?:\[[A-Za-z][\w.]*\]\s*)?\$?${PLACEHOLDER}`, 'g'),
    reason: 'A placeholder replaced a parameter name inside param(...).',
  },
  {
    re: new RegExp(
      String.raw`\b(?:[fF]unction|[fF]ilter|[wW]orkflow|[cC]lass)\s+${PLACEHOLDER}`,
      'g',
    ),
    reason: 'A placeholder replaced a function name after the function keyword.',
  },
  {
    re: new RegExp(String.raw`\w\.${PLACEHOLDER}`, 'g'),
    reason: 'A placeholder replaced a property or member name (.[…] breaks member access).',
  },
  {
    re: new RegExp(String.raw`\$${PLACEHOLDER}`, 'g'),
    reason: 'A placeholder replaced a variable name ($[…] is not valid PowerShell).',
  },
  {
    re: new RegExp(String.raw`${PLACEHOLDER}\s+-[A-Za-z][\w-]*\b`, 'g'),
    reason: 'A placeholder looks like a command followed by a parameter ([…] -Name).',
  },
  {
    re: new RegExp(String.raw`\w${PLACEHOLDER}|${PLACEHOLDER}\w`, 'g'),
    reason: 'A placeholder was spliced into the middle of an identifier.',
  },
];

const MAX_WARNINGS = 25;
const SNIPPET_RADIUS = 30;

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) {
    if (text[i] === '\n') line += 1;
  }
  return line;
}

function snippetAt(text: string, index: number, length: number): string {
  const lineStart = text.lastIndexOf('\n', index) + 1;
  let lineEnd = text.indexOf('\n', index + length);
  if (lineEnd === -1) lineEnd = text.length;
  const start = Math.max(lineStart, index - SNIPPET_RADIUS);
  const end = Math.min(lineEnd, index + length + SNIPPET_RADIUS);
  return `${start > lineStart ? '…' : ''}${text.slice(start, end).trim()}${
    end < lineEnd ? '…' : ''
  }`;
}

/**
 * Scan sanitized output for likely-invalid PowerShell placeholder use. One
 * warning per location; overlapping pattern hits are reported once, the more
 * specific reason (earlier pattern) winning.
 */
export function findCodeWarnings(cleanText: string): CodeWarning[] {
  const warnings: CodeWarning[] = [];
  const claimed: { start: number; end: number }[] = [];
  for (const { re, reason } of WARNING_PATTERNS) {
    const scanner = new RegExp(re.source, re.flags);
    let match: RegExpExecArray | null;
    while ((match = scanner.exec(cleanText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;
      if (claimed.some((c) => start < c.end && c.start < end)) continue;
      claimed.push({ start, end });
      warnings.push({
        line: lineOf(cleanText, start),
        snippet: snippetAt(cleanText, start, match[0].length),
        reason,
      });
      if (warnings.length >= MAX_WARNINGS) return warnings.sort((a, b) => a.line - b.line);
      if (match[0].length === 0) scanner.lastIndex += 1;
    }
  }
  return warnings.sort((a, b) => a.line - b.line);
}
