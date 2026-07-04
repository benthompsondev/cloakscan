import type { Category, Finding } from './types';

/**
 * Rendering model for the line-numbered source and preview views.
 * A segment is a run of text that is either plain, a highlighted match
 * (source view), or an inserted placeholder token (preview view).
 */
export interface Segment {
  text: string;
  kind: 'plain' | 'match' | 'placeholder';
  category?: Category;
  /** For 'match' segments: whether the finding is currently enabled. */
  enabled?: boolean;
}

export type Line = Segment[];

function sortedByStart(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => a.start - b.start);
}

/** Source text split into segments, with every finding marked for highlighting. */
export function buildSourceSegments(text: string, findings: Finding[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const f of sortedByStart(findings)) {
    if (f.start < cursor) continue; // findings never overlap; guard anyway
    if (f.start > cursor) segments.push({ text: text.slice(cursor, f.start), kind: 'plain' });
    segments.push({
      text: text.slice(f.start, f.end),
      kind: 'match',
      category: f.category,
      enabled: f.enabled,
    });
    cursor = f.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: 'plain' });
  return segments;
}

/**
 * Cleaned output as segments: enabled findings become placeholder tokens,
 * disabled findings stay as plain original text. Joining all segment text
 * yields exactly buildCleanText(text, findings).
 */
export function buildPreviewSegments(text: string, findings: Finding[]): Segment[] {
  const segments: Segment[] = [];
  let cursor = 0;
  for (const f of sortedByStart(findings)) {
    if (f.start < cursor) continue;
    if (f.start > cursor) segments.push({ text: text.slice(cursor, f.start), kind: 'plain' });
    if (f.enabled) {
      segments.push({ text: f.placeholder, kind: 'placeholder', category: f.category });
    } else {
      segments.push({ text: text.slice(f.start, f.end), kind: 'plain' });
    }
    cursor = f.end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor), kind: 'plain' });
  return segments;
}

/**
 * Split a segment stream on newlines into renderable lines. Segment text is
 * preserved byte-for-byte (minus the '\n' separators themselves); '\r' stays
 * attached to its line so CRLF content round-trips.
 */
export function segmentsToLines(segments: Segment[]): Line[] {
  const lines: Line[] = [[]];
  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1].push({ ...segment, text: part });
    });
  }
  return lines;
}
