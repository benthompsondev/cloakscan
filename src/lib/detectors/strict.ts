import type { Detector, RawMatch } from '../types';

/**
 * Strict-profile detectors. These only fire on values sitting in explicitly
 * labeled fields — they never guess at arbitrary capitalized words or scan
 * free text for name-shaped phrases.
 */

/**
 * Person names in explicit fields: Name:, FullName=, DisplayName:, Owner:,
 * RequestedBy:, Manager:, Approver:, Contact:.
 * The value must look like a person name — two to four capitalized words —
 * which keeps single words, hostnames, and ALL-CAPS constants out.
 * Field keys match common casings only; hostname/username do not match
 * because "name" must start at a word boundary.
 * Matching is strictly same-line ([ \t] only): a label and its value can
 * never span, or absorb, a line boundary.
 */
const FULL_NAME_LABELS =
  'full[ _-]?name|display[ _-]?name|owner|requested[ _-]?by|manager|approver|contact|author|created[ _-]?by|prepared[ _-]?by|modified[ _-]?by';
const SINGLE_NAME_LABELS =
  'name|first[ _-]?name|given[ _-]?name|last[ _-]?name|family[ _-]?name|surname';

function dedupeMatches(matches: RawMatch[]): RawMatch[] {
  const seen = new Set<string>();
  return matches
    .filter((match) => {
      const key = `${match.start}:${match.end}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.start - b.start);
}

function trimNextField(value: string): string {
  const nextField = value.search(
    /[ \t]{2,}[A-Za-z][A-Za-z0-9 _-]{0,30}[ \t]*[:=]/,
  );
  return (nextField >= 0 ? value.slice(0, nextField) : value).trim();
}

function labeledValues(text: string, labels: string): RawMatch[] {
  const re = new RegExp(
    String.raw`\b(?:${labels})\b[ \t]*[:=][ \t]*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^,;\r\n#]+))`,
    'giu',
  );
  const matches: RawMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = trimNextField(match[1] ?? match[2] ?? match[3] ?? '');
    if (!raw || raw.startsWith('$') || /^[[(<*]/.test(raw)) continue;
    const offset = match[0].lastIndexOf(raw);
    if (offset < 0) continue;
    matches.push({
      start: match.index + offset,
      end: match.index + offset + raw.length,
      value: raw,
      confidence: 'medium',
    });
  }
  return matches;
}

const CAPITALIZED_NAME_PART_RE = /^\p{Lu}[\p{L}\p{M}'’.-]*$/u;
const NAME_INITIAL_RE = /^\p{Lu}\.?$/u;
const NAME_PARTICLE_RE = /^(?:da|de|del|la|le|van|von)$/u;

function isCapitalizedNamePart(part: string): boolean {
  return CAPITALIZED_NAME_PART_RE.test(part) && /\p{Ll}/u.test(part);
}

function looksLikeName(value: string, allowSingle: boolean): boolean {
  const parts = value.split(/[ \t]+/u);
  if (parts.length < (allowSingle ? 1 : 2) || parts.length > 5) return false;
  return parts.every((part, index) => {
    if (isCapitalizedNamePart(part) || NAME_PARTICLE_RE.test(part)) return true;
    return index > 0 && NAME_INITIAL_RE.test(part);
  });
}

function bylineMatches(text: string): RawMatch[] {
  const re =
    /^[ \t]*#[^\r\n]*?\b(?:author|created[ \t]+by|prepared[ \t]+by|written[ \t]+by|maintainer|contact)\b[ \t]*[:=-]?[ \t]+([^\r\n,;#]+)/gimu;
  const matches: RawMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const value = match[1]
      .split(/[ \t]+(?:for|at|with|on|from|if|when|about|regarding|via|to)[ \t]+/iu, 1)[0]
      .trim();
    if (!looksLikeName(value, false)) continue;
    const offset = match[0].lastIndexOf(value);
    matches.push({
      start: match.index + offset,
      end: match.index + offset + value.length,
      value,
      confidence: 'medium',
    });
  }
  return matches;
}

function contextualQuotedNameMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  let lineStart = 0;
  while (lineStart < text.length) {
    const cr = text.indexOf('\r', lineStart);
    const lf = text.indexOf('\n', lineStart);
    const lineEnd = Math.min(
      cr < 0 ? text.length : cr,
      lf < 0 ? text.length : lf,
    );
    const line = text.slice(lineStart, lineEnd);
    if (!/\b(?:name|names|person|people|contact|owner|manager|author)\b/iu.test(line)) {
      lineStart = lineEnd + (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1);
      continue;
    }
    const quotedRe = /"([^"\r\n]+)"|'([^'\r\n]+)'/gu;
    let quoted: RegExpExecArray | null;
    while ((quoted = quotedRe.exec(line)) !== null) {
      const value = (quoted[1] ?? quoted[2] ?? '').trim();
      if (!looksLikeName(value, true)) continue;
      const offset = quoted.index + quoted[0].indexOf(value);
      matches.push({
        start: lineStart + offset,
        end: lineStart + offset + value.length,
        value,
        confidence: 'low',
      });
    }
    lineStart = lineEnd + (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1);
  }
  return matches;
}

export const personNameDetector: Detector = {
  id: 'person-name',
  name: 'Person name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'NAME',
  priority: 52,
  strictOnly: true,
  explanation: 'A person name in an explicit Name/Owner/RequestedBy-style field.',
  detect: (text) =>
    dedupeMatches([
      ...labeledValues(text, FULL_NAME_LABELS).filter((match) =>
        looksLikeName(match.value, false),
      ),
      ...labeledValues(text, SINGLE_NAME_LABELS).filter((match) =>
        looksLikeName(match.value, true),
      ),
      ...bylineMatches(text),
      ...contextualQuotedNameMatches(text),
    ]),
};

/**
 * Organization names in explicit fields: Company:, CompanyName=,
 * Organization:, TenantName:, Employer:. The key is unambiguous, so a single
 * capitalized word is accepted (e.g. Company: Contoso).
 */
const ORG_LABELS =
  'company[ _-]?name|company|organi[sz]ation|org[ _-]?name|tenant[ _-]?name|employer|department|business[ _-]?unit|agency|client|site|facility|hospital|school|vendor';
const ORG_CONNECTOR_RE = /^(?:&|and|of|the|de|la)$/iu;
const ORG_WORD_RE = /^(?:\p{Lu}|[0-9])[\p{L}\p{M}0-9&.'’/-]*$/u;

function looksLikeOrganization(value: string): boolean {
  const parts = value.replace(/[.]$/, '').split(/[ \t]+/u);
  if (parts.length < 1 || parts.length > 8) return false;
  return (
    parts.some((part) => ORG_WORD_RE.test(part)) &&
    parts.every((part) => ORG_WORD_RE.test(part) || ORG_CONNECTOR_RE.test(part))
  );
}

const ORG_SUFFIX =
  'Health|Healthcare|Hospital|University|College|School|Services|Systems|Solutions|Department|Team|Foundation|Association|Agency|Ministry|Council|Institute|Centre|Center|Clinic|Network|Group|Company|Corporation|Corp|Inc|Ltd|LLC';
const ORG_SUFFIXES = new Set(ORG_SUFFIX.toLowerCase().split('|'));

function trimOrganizationPunctuation(match: RawMatch): RawMatch {
  const value = match.value.replace(/[.]$/, '');
  return { ...match, value, end: match.start + value.length };
}

function contextualOrganizationMatches(text: string): RawMatch[] {
  const re =
    /^[ \t]*#[^\r\n]*?\b(?:for|at|client(?:[ \t]+is)?|company(?:[ \t]+is)?|organi[sz]ation(?:[ \t]+is)?)[ \t]*[:=-]?[ \t]+([^\r\n,;#]+)/gimu;
  const matches: RawMatch[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    let candidate = match[1]
      .split(/[ \t]+(?:by|from|with|using|on)[ \t]+/iu, 1)[0]
      .trim();
    candidate = candidate.replace(/^the[ \t]+/iu, '');
    const parts = candidate.split(/[ \t]+/u);
    const suffixIndex = parts.findIndex((part) =>
      ORG_SUFFIXES.has(part.replace(/[.'’]/gu, '').toLowerCase()),
    );
    if (suffixIndex < 0) continue;
    candidate = parts.slice(0, Math.min(parts.length, suffixIndex + 3)).join(' ');
    if (!looksLikeOrganization(candidate)) continue;
    const offset = match[0].lastIndexOf(candidate);
    if (offset < 0) continue;
    matches.push({
      start: match.index + offset,
      end: match.index + offset + candidate.length,
      value: candidate,
      confidence: 'medium',
    });
  }
  return matches;
}

export const orgNameDetector: Detector = {
  id: 'org-name',
  name: 'Organization name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'ORG',
  priority: 51,
  strictOnly: true,
  explanation: 'An organization name in an explicit Company/Organization/TenantName-style field.',
  detect: (text) =>
    dedupeMatches([
      ...labeledValues(text, ORG_LABELS)
        .map(trimOrganizationPunctuation)
        .filter((match) => looksLikeOrganization(match.value)),
      ...contextualOrganizationMatches(text),
    ]),
};
