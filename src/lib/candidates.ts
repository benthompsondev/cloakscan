import { MAX_TERM_LENGTH } from './customPacks';
import {
  isCalendarWord,
  isNameStopWord,
  isPowerShellCmdletShape,
} from './detectors/strict';
import { findPowerShellRegexRanges, type ProtectedRange } from './protectedRanges';
import type { Finding } from './types';

export interface CloakCandidate {
  text: string;
  count: number;
  firstStart: number;
}

interface CandidateOccurrence {
  text: string;
  start: number;
  end: number;
  kind: 'title' | 'acronym';
  titleTokenCount: number;
}

interface LineToken {
  core: string;
  start: number;
  end: number;
  trailing: string;
}

const TITLE_TOKEN_RE = /^[A-Z][a-z]+$/;
const CONNECTORS = new Set(['of', 'and', '&', 'de', 'van', 'der', 'da', 'the']);
const ALL_CAPS_RE = /\b[A-Z]{2,6}\b/gu;
const MAX_CANDIDATES = 15;

function overlaps(a: { start: number; end: number }, b: { start: number; end: number }): boolean {
  return a.start < b.end && b.start < a.end;
}

function blocked(
  occurrence: CandidateOccurrence,
  findings: readonly Finding[],
  protectedRanges: readonly ProtectedRange[],
): boolean {
  return (
    findings.some((finding) => overlaps(occurrence, finding)) ||
    protectedRanges.some((range) => overlaps(occurrence, range))
  );
}

function normalizeCandidate(value: string): string {
  return value.normalize('NFC').replace(/[ \t\u00a0]+/gu, ' ').toLocaleLowerCase();
}

function lineTokens(line: string, lineStart: number): LineToken[] {
  const tokens: LineToken[] = [];
  const tokenRe = /\S+/gu;
  let match: RegExpExecArray | null;
  while ((match = tokenRe.exec(line)) !== null) {
    const raw = match[0];
    const leading = raw.match(/^[([{"'“‘]+/u)?.[0].length ?? 0;
    const trailing = raw.match(/[)\]}"'”’.,;:!?=]+$/u)?.[0] ?? '';
    const core = raw.slice(leading, raw.length - trailing.length);
    if (core.length === 0) continue;
    const start = lineStart + match.index + leading;
    tokens.push({ core, start, end: start + core.length, trailing });
  }
  return tokens;
}

function titleCaseOccurrences(text: string): CandidateOccurrence[] {
  const occurrences: CandidateOccurrence[] = [];
  let lineStart = 0;

  while (lineStart <= text.length) {
    const cr = text.indexOf('\r', lineStart);
    const lf = text.indexOf('\n', lineStart);
    const lineEnd = Math.min(cr < 0 ? text.length : cr, lf < 0 ? text.length : lf);
    const tokens = lineTokens(text.slice(lineStart, lineEnd), lineStart);

    for (let index = 0; index < tokens.length; ) {
      const first = tokens[index];
      if (
        !TITLE_TOKEN_RE.test(first.core) ||
        first.trailing.includes(':') ||
        first.trailing.includes('=') ||
        isPowerShellCmdletShape(first.core)
      ) {
        index += 1;
        continue;
      }

      const run: LineToken[] = [];
      let titleTokenCount = 0;
      let cursor = index;
      let rejected = false;

      while (cursor < tokens.length) {
        const token = tokens[cursor];
        const lower = token.core.toLocaleLowerCase();
        const isTitle = TITLE_TOKEN_RE.test(token.core);
        const isConnector = CONNECTORS.has(lower) && titleTokenCount > 0;

        if (!isTitle && !isConnector) break;
        if (isTitle && (isNameStopWord(token.core) || isCalendarWord(token.core))) {
          rejected = true;
        }
        if (isPowerShellCmdletShape(token.core)) {
          rejected = true;
        }
        if (
          (token.trailing.includes(':') || token.trailing.includes('=')) &&
          titleTokenCount > 0
        ) {
          break;
        }

        run.push(token);
        if (isTitle) titleTokenCount += 1;
        cursor += 1;

        if (token.trailing.length > 0) break;
      }

      while (run.length > 0 && CONNECTORS.has(run[run.length - 1].core.toLocaleLowerCase())) {
        run.pop();
      }

      const last = run[run.length - 1];
      if (!rejected && last && titleTokenCount > 0) {
        const value = text.slice(first.start, last.end);
        if (value.length <= MAX_TERM_LENGTH) {
          occurrences.push({
            text: value,
            start: first.start,
            end: last.end,
            kind: 'title',
            titleTokenCount,
          });
        }
      }

      index = Math.max(index + 1, cursor);
    }

    if (lineEnd === text.length) break;
    lineStart = lineEnd + (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1);
  }

  return occurrences;
}

function acronymOccurrences(text: string): CandidateOccurrence[] {
  const occurrences: CandidateOccurrence[] = [];
  let match: RegExpExecArray | null;
  ALL_CAPS_RE.lastIndex = 0;
  while ((match = ALL_CAPS_RE.exec(text)) !== null) {
    if (isNameStopWord(match[0]) || isCalendarWord(match[0])) continue;
    occurrences.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
      kind: 'acronym',
      titleTokenCount: 0,
    });
  }
  return occurrences;
}

/**
 * Suggest likely names and organization terms for review. Suggestions never
 * become findings or replacements until the user explicitly hides one.
 */
export function findCloakCandidates(
  text: string,
  findings: readonly Finding[],
): CloakCandidate[] {
  if (text.length === 0) return [];

  const protectedRanges = findPowerShellRegexRanges(text);
  const eligible = [...titleCaseOccurrences(text), ...acronymOccurrences(text)].filter(
    (occurrence) => !blocked(occurrence, findings, protectedRanges),
  );
  const grouped = new Map<
    string,
    {
      text: string;
      count: number;
      firstStart: number;
      qualifiesImmediately: boolean;
    }
  >();

  for (const occurrence of eligible) {
    const key = normalizeCandidate(occurrence.text);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstStart = Math.min(existing.firstStart, occurrence.start);
      existing.qualifiesImmediately ||= occurrence.titleTokenCount >= 2;
      continue;
    }
    grouped.set(key, {
      text: occurrence.text,
      count: 1,
      firstStart: occurrence.start,
      qualifiesImmediately: occurrence.kind === 'title' && occurrence.titleTokenCount >= 2,
    });
  }

  return [...grouped.values()]
    .filter((candidate) => candidate.qualifiesImmediately || candidate.count >= 2)
    .sort((a, b) => b.count - a.count || a.firstStart - b.firstStart)
    .slice(0, MAX_CANDIDATES)
    .map(({ text: candidateText, count, firstStart }) => ({
      text: candidateText,
      count,
      firstStart,
    }));
}
