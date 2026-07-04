import type { RawMatch } from '../types';

/**
 * Deterministic CSV column scanning for the Strict person/org detectors.
 *
 * This is a parsing helper, not a detector: it only extracts cells that sit
 * under a PLAUSIBLE CSV header containing recognized person or organization
 * columns. Arbitrary comma-separated prose never qualifies — the header line
 * must consist entirely of simple header-shaped cells, at least one of them
 * recognized, and at least one following line must parse with the same
 * column count. Structure (quotes, escaped quotes, commas, empty cells,
 * CRLF/LF) is never touched: a match covers exactly one cell's content,
 * inside its quotes when quoted, and the shape validation is supplied by the
 * caller so this module contains no name knowledge at all.
 */

const PERSON_COLUMNS = new Set([
  'name',
  'fullname',
  'displayname',
  'firstname',
  'givenname',
  'lastname',
  'familyname',
  'surname',
  'preferredname',
  'owner',
  'manager',
  'supervisor',
  'contact',
  'contactname',
  'requestedby',
  'approver',
  'approvedby',
  'author',
  'createdby',
  'preparedby',
  'modifiedby',
  'employeename',
  'patientname',
]);

const ORG_COLUMNS = new Set([
  'company',
  'companyname',
  'organization',
  'organisation',
  'orgname',
  'tenantname',
  'employer',
  'department',
  'businessunit',
  'agency',
  'client',
  'clientname',
  'site',
  'facility',
  'hospital',
  'school',
  'vendor',
  'vendorname',
]);

const HEADER_CELL_RE = /^[A-Za-z][A-Za-z0-9 _-]{0,39}$/;

interface CsvCell {
  /** Content bounds in the ORIGINAL text (inside quotes for quoted cells). */
  start: number;
  end: number;
  value: string;
}

function normalizeHeader(cell: string): string {
  return cell.trim().toLowerCase().replace(/[ _-]/g, '');
}

/**
 * Split one line into RFC-4180-style cells with exact source offsets.
 * Returns null when the line is not a well-formed CSV row (unclosed quote).
 */
function splitCsvLine(line: string, base: number): CsvCell[] | null {
  const cells: CsvCell[] = [];
  let i = 0;
  while (i <= line.length) {
    if (line[i] === '"') {
      // Quoted cell: consume until the closing quote, honoring "" escapes.
      const contentStart = i + 1;
      let j = contentStart;
      while (j < line.length) {
        if (line[j] === '"') {
          if (line[j + 1] === '"') {
            j += 2;
            continue;
          }
          break;
        }
        j += 1;
      }
      if (j >= line.length && line[j] !== '"') return null; // unclosed quote
      cells.push({ start: base + contentStart, end: base + j, value: line.slice(contentStart, j) });
      i = j + 1;
      if (i < line.length && line[i] !== ',') return null; // junk after closing quote
      i += 1;
    } else {
      const next = line.indexOf(',', i);
      const rawEnd = next < 0 ? line.length : next;
      const raw = line.slice(i, rawEnd);
      const leading = raw.length - raw.trimStart().length;
      const trimmed = raw.trim();
      cells.push({ start: base + i + leading, end: base + i + leading + trimmed.length, value: trimmed });
      if (next < 0) break;
      i = next + 1;
    }
  }
  return cells;
}

interface Line {
  text: string;
  start: number;
}

function splitLines(text: string): Line[] {
  const lines: Line[] = [];
  let start = 0;
  for (let i = 0; i <= text.length; i += 1) {
    if (i === text.length || text[i] === '\n' || text[i] === '\r') {
      lines.push({ text: text.slice(start, i), start });
      if (text[i] === '\r' && text[i + 1] === '\n') i += 1;
      start = i + 1;
    }
  }
  return lines;
}

export interface CsvColumnMatches {
  person: RawMatch[];
  org: RawMatch[];
}

/**
 * Find person/org cells under recognized CSV headers. `isPerson`/`isOrg`
 * decide whether one unescaped cell value has a defensible shape.
 */
export function csvColumnMatches(
  text: string,
  isPerson: (value: string) => boolean,
  isOrg: (value: string) => boolean,
): CsvColumnMatches {
  const person: RawMatch[] = [];
  const org: RawMatch[] = [];
  const lines = splitLines(text);

  let index = 0;
  while (index < lines.length) {
    const header = lines[index];
    const headerCells = header.text.includes(',') ? splitCsvLine(header.text, header.start) : null;
    const isHeader =
      headerCells !== null &&
      headerCells.length >= 2 &&
      headerCells.every((cell) => HEADER_CELL_RE.test(cell.value.trim())) &&
      headerCells.some(
        (cell) => PERSON_COLUMNS.has(normalizeHeader(cell.value)) || ORG_COLUMNS.has(normalizeHeader(cell.value)),
      );
    if (!isHeader) {
      index += 1;
      continue;
    }

    const personCols: number[] = [];
    const orgCols: number[] = [];
    headerCells.forEach((cell, col) => {
      const key = normalizeHeader(cell.value);
      if (PERSON_COLUMNS.has(key)) personCols.push(col);
      if (ORG_COLUMNS.has(key)) orgCols.push(col);
    });

    // Data rows: consecutive lines with the SAME column count. The first
    // mismatching non-empty line ends the block (no guessing).
    let row = index + 1;
    let sawDataRow = false;
    while (row < lines.length) {
      const line = lines[row];
      if (line.text.trim() === '') break;
      const cells = splitCsvLine(line.text, line.start);
      if (cells === null || cells.length !== headerCells.length) break;
      sawDataRow = true;
      const collect = (cols: number[], out: RawMatch[], test: (value: string) => boolean) => {
        for (const col of cols) {
          const cell = cells[col];
          const unescaped = cell.value.replace(/""/g, '"').trim();
          if (unescaped.length === 0 || !test(unescaped)) continue;
          if (cell.end <= cell.start) continue;
          out.push({
            start: cell.start,
            end: cell.end,
            value: text.slice(cell.start, cell.end),
            confidence: 'low',
          });
        }
      };
      collect(personCols, person, isPerson);
      collect(orgCols, org, isOrg);
      row += 1;
    }
    index = sawDataRow ? row : index + 1;
  }

  return { person, org };
}
