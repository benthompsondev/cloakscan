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

const POWERSHELL_COLORS = new Set(
  [
    'Black',
    'DarkBlue',
    'DarkGreen',
    'DarkCyan',
    'DarkRed',
    'DarkMagenta',
    'DarkYellow',
    'Gray',
    'DarkGray',
    'Blue',
    'Green',
    'Cyan',
    'Red',
    'Magenta',
    'Yellow',
    'White',
  ].map((value) => value.toLocaleLowerCase()),
);

const LANGUAGE_KEYWORDS = new Set(
  [
    'Function',
    'Param',
    'Begin',
    'Process',
    'End',
    'Try',
    'Catch',
    'Finally',
    'Foreach',
    'While',
    'Switch',
    'Return',
    'Break',
    'Continue',
    'If',
    'Else',
    'Do',
    'Until',
    'Throw',
    'True',
    'False',
    'Null',
  ].map((value) => value.toLocaleLowerCase()),
);

const GENERIC_TITLE_WORDS = new Set(
  [
    'Added',
    'Removed',
    'Updated',
    'Created',
    'Deleted',
    'Failed',
    'Error',
    'Warning',
    'Success',
    'Completed',
    'Starting',
    'Started',
    'Stopped',
    'Running',
    'Done',
    'Loading',
    'Processing',
    'Access',
    'Value',
    'Type',
    'Status',
    'Result',
    'Count',
    'Total',
    'Output',
    'Input',
    'Date',
    'Cloak',
    'List',
  ].map((value) => value.toLocaleLowerCase()),
);

const TECH_ACRONYMS = new Set([
  'ID', 'AD', 'OU', 'DN', 'DC', 'CN', 'IP', 'DNS', 'URL', 'URI', 'API', 'CLI', 'GUI', 'OS',
  'VM', 'DB', 'SQL', 'CSV', 'TSV', 'XML', 'JSON', 'YAML', 'HTML', 'HTTP', 'HTTPS', 'FTP',
  'SSH', 'TCP', 'UDP', 'EXE', 'DLL', 'MSI', 'PDF', 'ZIP', 'LOG', 'TXT', 'RAM', 'CPU', 'GPU',
  'USB', 'LAN', 'WAN', 'VPN', 'UTC', 'GMT', 'ISO', 'UI', 'UX', 'QA', 'CI', 'CD', 'PS', 'WMI',
  'GPO', 'SID', 'UPN', 'ACL', 'NTFS', 'SMTP', 'TLS', 'SSL', 'JWT', 'MFA', 'SSO', 'REST', 'KB',
  'MB', 'GB', 'TB', 'AM', 'PM', 'OK', 'ERR', 'WARN', 'INFO', 'DEBUG', 'NIS', 'BT', 'NIC',
  'DOB', 'SIN', 'AWS',
]);

const DATE_FORMAT_TOKENS = new Set(['YYYY', 'YY', 'MM', 'MMM', 'MMMM', 'DD', 'HH', 'SS', 'MS']);

function isTitleStopWord(value: string): boolean {
  const lower = value.toLocaleLowerCase();
  return (
    POWERSHELL_COLORS.has(lower) ||
    LANGUAGE_KEYWORDS.has(lower) ||
    GENERIC_TITLE_WORDS.has(lower) ||
    isNameStopWord(value) ||
    isCalendarWord(value)
  );
}

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

export function candidateKey(value: string): string {
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
      let novelTitleTokenCount = 0;
      let cursor = index;
      let rejected = false;

      while (cursor < tokens.length) {
        const token = tokens[cursor];
        const lower = token.core.toLocaleLowerCase();
        const isTitle = TITLE_TOKEN_RE.test(token.core);
        const isConnector = CONNECTORS.has(lower) && titleTokenCount > 0;

        if (!isTitle && !isConnector) break;
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
        if (isTitle) {
          titleTokenCount += 1;
          if (!isTitleStopWord(token.core)) novelTitleTokenCount += 1;
        }
        cursor += 1;

        if (token.trailing.length > 0) break;
      }

      while (run.length > 0 && CONNECTORS.has(run[run.length - 1].core.toLocaleLowerCase())) {
        run.pop();
      }

      const last = run[run.length - 1];
      if (!rejected && last && titleTokenCount > 0 && novelTitleTokenCount > 0) {
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
    if (
      TECH_ACRONYMS.has(match[0]) ||
      DATE_FORMAT_TOKENS.has(match[0]) ||
      isNameStopWord(match[0]) ||
      isCalendarWord(match[0])
    ) {
      continue;
    }
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
  dismissedCandidateKeys: readonly string[] = [],
): CloakCandidate[] {
  if (text.length === 0) return [];

  const dismissed = new Set(dismissedCandidateKeys.map(candidateKey));
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
      isMultiWordTitle: boolean;
    }
  >();

  for (const occurrence of eligible) {
    const key = candidateKey(occurrence.text);
    const existing = grouped.get(key);
    if (existing) {
      existing.count += 1;
      existing.firstStart = Math.min(existing.firstStart, occurrence.start);
      existing.qualifiesImmediately ||=
        occurrence.kind === 'acronym' || occurrence.titleTokenCount >= 2;
      existing.isMultiWordTitle ||= occurrence.kind === 'title' && occurrence.titleTokenCount >= 2;
      continue;
    }
    grouped.set(key, {
      text: occurrence.text,
      count: 1,
      firstStart: occurrence.start,
      qualifiesImmediately: occurrence.kind === 'acronym' || occurrence.titleTokenCount >= 2,
      isMultiWordTitle: occurrence.kind === 'title' && occurrence.titleTokenCount >= 2,
    });
  }

  return [...grouped.values()]
    .filter((candidate) => candidate.qualifiesImmediately || candidate.count >= 2)
    .filter((candidate) => !dismissed.has(candidateKey(candidate.text)))
    .sort(
      (a, b) =>
        Number(b.isMultiWordTitle) - Number(a.isMultiWordTitle) ||
        b.count - a.count ||
        a.firstStart - b.firstStart,
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ text: candidateText, count, firstStart }) => ({
      text: candidateText,
      count,
      firstStart,
    }));
}
