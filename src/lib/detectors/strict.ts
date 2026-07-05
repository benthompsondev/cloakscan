import type { Detector, RawMatch } from '../types';
import { csvColumnMatches } from './structuredNames';

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
  'full[ _-]?name|display[ _-]?name|owner|requested[ _-]?by|manager|approver|contact|author|created[ _-]?by|prepared[ _-]?by|modified[ _-]?by|requester|requestor|reviewer|submitter|recipient|attn|attention|assigned[ _-]?to|technician|supervisor|employee(?:[ _-]?name)?|patient(?:[ _-]?name)?|user|to|from|cc|bcc';
const SINGLE_NAME_LABELS =
  'name|first[ _-]?name|given[ _-]?name|last[ _-]?name|family[ _-]?name|surname';

function dedupeMatches(matches: RawMatch[]): RawMatch[] {
  const seen = new Set<string>();
  const unique = matches.filter((match) => {
    const key = `${match.start}:${match.end}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // When two sources of the SAME rule overlap (a labeled value and a
  // free-text phrase inside it), keep only the longer span — exactly what
  // engine overlap resolution would do anyway.
  return unique
    .filter(
      (match) =>
        !unique.some(
          (other) =>
            other !== match &&
            other.start <= match.start &&
            other.end >= match.end &&
            other.end - other.start > match.end - match.start,
        ),
    )
    .sort((a, b) => a.start - b.start);
}

function trimNextField(value: string): string {
  const nextField = value.search(
    /[ \t]{2,}[A-Za-z][A-Za-z0-9 _-]{0,30}[ \t]*[:=]/,
  );
  return (nextField >= 0 ? value.slice(0, nextField) : value).trim();
}

function labeledValues(text: string, labels: string): RawMatch[] {
  // The label may be a bare word (INI/YAML/PowerShell) or a quoted JSON key.
  // Only the VALUE is ever captured — keys, quotes, colons, commas, and
  // braces stay byte-for-byte untouched.
  const re = new RegExp(
    String.raw`(?:"(?:${labels})"|'(?:${labels})'|\b(?:${labels})\b)[ \t]*[:=][ \t]*(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^,;\r\n#]+))`,
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
      confidence: 'low',
    });
  }
  return matches;
}

const CAPITALIZED_NAME_PART_RE = /^\p{Lu}[\p{L}\p{M}'’.-]*$/u;
const NAME_INITIAL_RE = /^\p{Lu}\.?$/u;
// Lowercase name particles: a small closed grammatical class, not a name list.
const NAME_PARTICLE_RE =
  /^(?:al|bin|da|das|de|del|della|den|der|di|dos|du|el|ibn|la|le|te|ten|ter|van|von)$/u;
// Generational suffixes, accepted only as the final part of a multi-part name.
const NAME_SUFFIX_RE = /^(?:Jr|Sr|II|III|IV)\.?$/u;
// PowerShell Verb-Noun command shape (command grammar, not a dictionary):
// values like Get-Random or Restart-Service are never person names.
export const CMDLET_SHAPE_RE =
  /^(?:Add|Clear|Close|Compare|Convert|ConvertFrom|ConvertTo|Copy|Disable|Dismount|Enable|Enter|Exit|Expand|Export|Find|Format|Get|Import|Install|Invoke|Join|Measure|Mount|Move|New|Out|Push|Pop|Read|Register|Remove|Rename|Reset|Resize|Resolve|Restart|Restore|Resume|Select|Send|Set|Show|Sort|Split|Start|Stop|Suspend|Test|Unblock|Uninstall|Unregister|Update|Wait|Write)-\p{Lu}[\p{L}\p{Nd}]*$/u;

export function isPowerShellCmdletShape(value: string): boolean {
  return CMDLET_SHAPE_RE.test(value);
}

function isCapitalizedNamePart(part: string): boolean {
  return CAPITALIZED_NAME_PART_RE.test(part) && /\p{Ll}/u.test(part);
}

function looksLikeName(value: string, allowSingle: boolean): boolean {
  const parts = value.split(/[ \t]+/u);
  if (parts.length < (allowSingle ? 1 : 2) || parts.length > 5) return false;
  if (parts.some((part) => isPowerShellCmdletShape(part))) return false;
  return parts.every((part, index) => {
    if (isCapitalizedNamePart(part) || NAME_PARTICLE_RE.test(part)) return true;
    if (index > 0 && index === parts.length - 1 && NAME_SUFFIX_RE.test(part)) return true;
    return index > 0 && NAME_INITIAL_RE.test(part);
  });
}

/**
 * Values written in scripts WITHOUT letter casing (CJK, Arabic, Hebrew, …).
 * Casing-based shape checks cannot apply, so these are accepted only where
 * the caller has a strong explicit context: a labeled field or a recognized
 * structured column — never free text.
 */
const CASELESS_VALUE_RE = /^[\p{L}\p{M}][\p{L}\p{M}\p{Nd}・'’. -]{0,39}$/u;

function isCaselessScriptValue(value: string): boolean {
  return (
    !/[\p{Lu}\p{Ll}]/u.test(value) && /\p{L}/u.test(value) && CASELESS_VALUE_RE.test(value)
  );
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
      confidence: 'low',
    });
  }
  return matches;
}

/**
 * Names after clear prose cues on one line: "Contact Alex Demo?",
 * "as per Casey R specifications", "pulled from Casey Rivera",
 * "prepared by Bea Example". The cue supplies the context; the value must
 * still be name-shaped, at least two parts, and free of grammatical stop
 * words — a closed word class, not a name dictionary. Trailing sentence
 * punctuation is never captured.
 */
const PROSE_CUE_RE =
  /\b(?:contact(?:ed)?|as[ \t]+per|c\/o|(?:prepared|written|created|authored|reviewed|approved|submitted|requested|signed|provided|sent|pulled|lifted|copied|received|forwarded)[ \t]+(?:by|from)|(?:prepared|created|written|reviewed|approved|submitted|signed)[ \t]+for[ \t][^\r\n]{0,80}?[ \t]by|(?:escalated|assigned|handed[ \t]+off|transferred|routed)[ \t]+to|(?:spoke|met|meeting|call|conversation)[ \t]+with|on[ \t]+behalf[ \t]+of|(?:kind[ \t]+|warm[ \t]+|best[ \t]+|many[ \t]+)?(?:regards|thanks|thank[ \t]+you|sincerely|cheers)[ \t]*,)[ \t]+/giu;

// Grammatical stop words (articles, pronouns, common verbs/adverbs). A name
// token matching one of these ends the candidate.
export const NAME_STOP_WORDS = [
  'a',
  'an',
  'the',
  'this',
  'that',
  'these',
  'those',
  'my',
  'our',
  'your',
  'his',
  'her',
  'their',
  'its',
  'me',
  'us',
  'him',
  'them',
  'we',
  'you',
  'it',
  'he',
  'she',
  'they',
  'i',
  'if',
  'when',
  'then',
  'all',
  'any',
  'each',
  'every',
  'some',
  'no',
  'not',
  'please',
  'and',
  'or',
  'but',
  'for',
  'with',
  'at',
  'on',
  'in',
  'to',
  'from',
  'by',
  'of',
  'as',
  'is',
  'are',
  'was',
  'were',
  'be',
  'being',
  'been',
  'will',
  'shall',
  'should',
  'would',
  'can',
  'could',
  'may',
  'might',
  'must',
  'do',
  'does',
  'did',
  'here',
  'there',
  'now',
  'today',
  'support',
  'team',
  'help',
  'desk',
  'admin',
  'it',
] as const;

export const CALENDAR_WORDS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'mon',
  'tue',
  'tues',
  'wed',
  'thu',
  'thur',
  'thurs',
  'fri',
  'sat',
  'sun',
] as const;

const NAME_STOP_WORD_SET = new Set<string>(NAME_STOP_WORDS);
const CALENDAR_WORD_SET = new Set<string>(CALENDAR_WORDS);

export function isNameStopWord(value: string): boolean {
  return NAME_STOP_WORD_SET.has(value.toLocaleLowerCase());
}

export function isCalendarWord(value: string): boolean {
  return CALENDAR_WORD_SET.has(value.toLocaleLowerCase());
}

const TRAILING_PUNCT_RE = /[?!.,;:)\]'"’]+$/u;

/**
 * Walk name-shaped tokens on ONE line starting at `afterCue`. Returns the
 * candidate span when at least `minTokens` tokens qualify. Grammatical stop
 * words and cmdlet shapes end the walk; trailing sentence punctuation is
 * never included in the span.
 */
function nameTokensAfter(
  text: string,
  afterCue: number,
  minTokens: number,
): { start: number; end: number } | null {
  const lineEndCr = text.indexOf('\r', afterCue);
  const lineEndLf = text.indexOf('\n', afterCue);
  const lineEnd = Math.min(
    lineEndCr < 0 ? text.length : lineEndCr,
    lineEndLf < 0 ? text.length : lineEndLf,
  );
  const rest = text.slice(afterCue, lineEnd);

  const tokenRe = /[^ \t]+/gu;
  let token: RegExpExecArray | null;
  let accepted = 0;
  let candidateStart = -1;
  let candidateEnd = -1;
  while ((token = tokenRe.exec(rest)) !== null && accepted < 5) {
    const raw = token[0];
    const trailing = raw.match(TRAILING_PUNCT_RE)?.[0] ?? '';
    // "Jr." / "Alex T." keep their abbreviating period; strip other tails.
    let core = raw.slice(0, raw.length - trailing.length);
    if (trailing.startsWith('.') && (NAME_SUFFIX_RE.test(`${core}.`) || NAME_INITIAL_RE.test(`${core}.`))) {
      core = `${core}.`;
    }
    if (core.length === 0 || isNameStopWord(core) || isPowerShellCmdletShape(core)) break;
    const first = accepted === 0;
    const isPart = isCapitalizedNamePart(core);
    const isOther =
      !first &&
      (NAME_PARTICLE_RE.test(core) || NAME_INITIAL_RE.test(core) || NAME_SUFFIX_RE.test(core));
    if (!isPart && !isOther) break;
    if (first) candidateStart = afterCue + token.index;
    candidateEnd = afterCue + token.index + core.length;
    accepted += 1;
    if (core.length !== raw.length) break; // punctuation ended the phrase
  }
  return accepted >= minTokens && candidateStart >= 0
    ? { start: candidateStart, end: candidateEnd }
    : null;
}

function proseCueNameMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  let cue: RegExpExecArray | null;
  PROSE_CUE_RE.lastIndex = 0;
  while ((cue = PROSE_CUE_RE.exec(text)) !== null) {
    const span = nameTokensAfter(text, cue.index + cue[0].length, 2);
    if (span) {
      matches.push({
        start: span.start,
        end: span.end,
        value: text.slice(span.start, span.end),
        confidence: 'low',
      });
    }
  }
  return matches;
}

/**
 * Honorific-prefixed names in free text: "Dr. Alex Demo", "Ms. Rivera".
 * The honorific itself is strong person context, so a single following
 * name token is enough. Case-sensitive: "MS" or "dr" never match.
 */
const HONORIFIC_RE = /\b(?:Dr|Mr|Mrs|Ms|Mx|Prof|Professor|Rev)\.?[ \t]+/gu;

function honorificNameMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  let honorific: RegExpExecArray | null;
  HONORIFIC_RE.lastIndex = 0;
  while ((honorific = HONORIFIC_RE.exec(text)) !== null) {
    const span = nameTokensAfter(text, honorific.index + honorific[0].length, 1);
    if (span) {
      matches.push({
        start: span.start,
        end: span.end,
        value: text.slice(span.start, span.end),
        confidence: 'low',
      });
    }
  }
  return matches;
}

/**
 * Email-style signatures where the closing sits on its own line and the name
 * follows on the next line. The match is ONLY the name line — the closing
 * line and everything after stay untouched, and the name must fill its whole
 * line with a 2+-part name shape.
 */
const SIGNATURE_CLOSING_LINE_RE =
  /^[ \t]*(?:kind[ \t]+regards|warm[ \t]+regards|best[ \t]+regards|many[ \t]+thanks|regards|thanks|thank[ \t]+you|sincerely|cheers|respectfully)[ \t]*[,.!]?[ \t]*$/iu;

function signatureNameMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const lineRe = /[^\r\n]*/gu;
  const lines: { text: string; start: number }[] = [];
  let pos = 0;
  while (pos <= text.length) {
    lineRe.lastIndex = pos;
    const m = lineRe.exec(text);
    const lineText = m?.[0] ?? '';
    lines.push({ text: lineText, start: pos });
    pos += lineText.length;
    if (text[pos] === '\r' && text[pos + 1] === '\n') pos += 2;
    else if (pos < text.length) pos += 1;
    else break;
  }
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!SIGNATURE_CLOSING_LINE_RE.test(lines[i].text)) continue;
    const next = lines[i + 1];
    const trimmed = next.text.trim();
    if (trimmed.length === 0 || !looksLikeName(trimmed, false)) continue;
    const offset = next.text.indexOf(trimmed);
    matches.push({
      start: next.start + offset,
      end: next.start + offset + trimmed.length,
      value: trimmed,
      confidence: 'low',
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
    // PowerShell parameters like -Name or -DisplayName are command syntax,
    // not name context: strip them before looking for context words.
    const contextSource = line.replace(/(?:^|[ \t])-\w+/gu, ' ');
    if (!/\b(?:name|names|person|people|contact|owner|manager|author)\b/iu.test(contextSource)) {
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

const isPersonShaped = (value: string) => looksLikeName(value, true) || isCaselessScriptValue(value);

export const personNameDetector: Detector = {
  id: 'person-name',
  name: 'Person name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'NAME',
  priority: 52,
  strictOnly: true,
  explanation:
    'A person name in an explicit Name/Owner/RequestedBy-style field, a recognized CSV column, or after a clear contact/prepared-by cue.',
  detect: (text) =>
    dedupeMatches([
      ...labeledValues(text, FULL_NAME_LABELS).filter(
        (match) => looksLikeName(match.value, false) || isCaselessScriptValue(match.value),
      ),
      ...labeledValues(text, SINGLE_NAME_LABELS).filter((match) => isPersonShaped(match.value)),
      ...bylineMatches(text),
      ...proseCueNameMatches(text),
      ...honorificNameMatches(text),
      ...signatureNameMatches(text),
      ...contextualQuotedNameMatches(text),
      ...csvColumnMatches(text, isPersonShaped, () => false).person,
    ]),
};

/**
 * Organization names in explicit fields: Company:, CompanyName=,
 * Organization:, TenantName:, Employer:. The key is unambiguous, so a single
 * capitalized word is accepted (e.g. Company: Contoso).
 */
const ORG_LABELS =
  'company[ _-]?name|company|organi[sz]ation|org[ _-]?name|tenant[ _-]?name|employer|department|business[ _-]?unit|agency|client|site|facility|hospital|school|vendor|customer|partner|supplier|institution|division|practice|firm';
const ORG_CONNECTOR_RE = /^(?:&|and|of|the|de|la)$/iu;
const ORG_WORD_RE = /^(?:\p{Lu}|[0-9])[\p{L}\p{M}0-9&.'’/–—-]*$/u;
// All-caps placeholder tokens that read as "no value", never an organization.
const ORG_PLACEHOLDER_RE = /^(?:TBD|TBA|TODO|N\/A|NA|NONE|NULL|TRUE|FALSE|UNKNOWN|PENDING|DEFAULT)$/u;

function looksLikeOrganization(value: string): boolean {
  const parts = value.replace(/[.]$/, '').split(/[ \t]+/u);
  if (parts.length < 1 || parts.length > 8) return false;
  if (!/\p{L}/u.test(value)) return false; // an ID or count is not an organization
  if (parts.length === 1 && ORG_PLACEHOLDER_RE.test(parts[0])) return false;
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
      confidence: 'low',
    });
  }
  return matches;
}

/**
 * Copyright lines carry an unambiguous holder context: "Copyright (c) 2024
 * St. Example Healthcare Exampleville". The holder is captured up to the
 * first clause break; "All rights reserved" and trailing punctuation never
 * are. Works in plain text and comments alike.
 */
const COPYRIGHT_RE =
  /\bcopyright\b[ \t]*(?:\(c\)|©)?[ \t]*(?:19|20)\d{2}(?:[ \t]*[-–,][ \t]*(?:19|20)\d{2})*[ \t]+(?:by[ \t]+)?([^\r\n]+)/giu;

function copyrightOrganizationMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  let match: RegExpExecArray | null;
  COPYRIGHT_RE.lastIndex = 0;
  while ((match = COPYRIGHT_RE.exec(text)) !== null) {
    const clause = match[1]
      .split(/,|;|[ \t]+all[ \t]+rights/iu, 1)[0]
      .replace(/[ \t]+$/u, '');
    const parts = clause.split(/[ \t]+/u);
    let count = 0;
    while (
      count < Math.min(parts.length, 8) &&
      (ORG_WORD_RE.test(parts[count]) || (count > 0 && ORG_CONNECTOR_RE.test(parts[count])))
    ) {
      count += 1;
    }
    if (count === 0) continue;
    const candidate = parts.slice(0, count).join(' ').replace(/[.]$/u, '');
    if (!looksLikeOrganization(candidate)) continue;
    const offset = match[0].lastIndexOf(candidate);
    if (offset < 0) continue;
    matches.push({
      start: match.index + offset,
      end: match.index + offset + candidate.length,
      value: candidate,
      confidence: 'low',
    });
  }
  return matches;
}

/**
 * Free-text organizations with a STRONG institutional/legal suffix:
 * "Northwind Regional Hospital", "Fabrikam & Sons Ltd". The strong-suffix
 * list is deliberately small — generic suffixes like Team, Group, Services,
 * or Center would flag ordinary phrases ("The Deployment Team"). After the
 * strong suffix, immediately following broad suffix words are included so
 * "Lamna Healthcare Company" stays whole.
 */
const STRONG_ORG_SUFFIX_RE =
  /^(?:Hospital|Healthcare|Ltd|LLC|Inc|Corp|Corporation|Incorporated|University|College|Clinic|Foundation|Institute)$/u;

function freeTextOrganizationMatches(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  let lineStart = 0;
  while (lineStart < text.length) {
    const cr = text.indexOf('\r', lineStart);
    const lf = text.indexOf('\n', lineStart);
    const lineEnd = Math.min(cr < 0 ? text.length : cr, lf < 0 ? text.length : lf);
    const line = text.slice(lineStart, lineEnd);

    const tokenRe = /[^ \t]+/gu;
    const tokens: { raw: string; core: string; start: number }[] = [];
    let t: RegExpExecArray | null;
    while ((t = tokenRe.exec(line)) !== null) {
      const raw = t[0];
      const core = raw.replace(/[.,;:!?)\]"'’]+$/u, '');
      tokens.push({ raw, core, start: lineStart + t.index });
    }

    for (let i = 0; i < tokens.length; i += 1) {
      if (!STRONG_ORG_SUFFIX_RE.test(tokens[i].core)) continue;
      // Walk left over organization words and connectors. Pure numbers
      // (years, counts) never extend an organization leftward.
      let first = i;
      while (
        first > 0 &&
        i - first < 7 &&
        !/^\d+$/.test(tokens[first - 1].core) &&
        (ORG_WORD_RE.test(tokens[first - 1].core) || ORG_CONNECTOR_RE.test(tokens[first - 1].core)) &&
        tokens[first - 1].core === tokens[first - 1].raw // punctuation breaks the phrase
      ) {
        first -= 1;
      }
      // Drop leading connectors ("the", "and", "&") — they start no name.
      while (first < i && ORG_CONNECTOR_RE.test(tokens[first].core)) first += 1;
      if (first >= i) continue; // need at least one word before the suffix
      // Extend right over broad suffix words: "… Healthcare Company".
      let last = i;
      while (
        last + 1 < tokens.length &&
        tokens[last].core === tokens[last].raw &&
        ORG_WORD_RE.test(tokens[last + 1].core) &&
        ORG_SUFFIXES.has(tokens[last + 1].core.replace(/[.'’]/gu, '').toLowerCase())
      ) {
        last += 1;
      }
      const start = tokens[first].start;
      const end = tokens[last].start + tokens[last].core.length;
      const value = text.slice(start, end);
      if (!looksLikeOrganization(value)) continue;
      matches.push({ start, end, value, confidence: 'low' });
      i = last;
    }
    lineStart = lineEnd + (text[lineEnd] === '\r' && text[lineEnd + 1] === '\n' ? 2 : 1);
  }
  return matches;
}

const isOrgShaped = (value: string) => looksLikeOrganization(value) || isCaselessScriptValue(value);

export const orgNameDetector: Detector = {
  id: 'org-name',
  name: 'Organization name (labeled field)',
  category: 'personal',
  severity: 'medium',
  label: 'ORG',
  priority: 51,
  strictOnly: true,
  explanation:
    'An organization name in an explicit Company/Organization/TenantName-style field, a recognized CSV column, or a copyright line.',
  detect: (text) =>
    dedupeMatches([
      ...labeledValues(text, ORG_LABELS)
        .map(trimOrganizationPunctuation)
        .filter((match) => isOrgShaped(match.value)),
      ...contextualOrganizationMatches(text),
      ...copyrightOrganizationMatches(text),
      ...freeTextOrganizationMatches(text),
      ...csvColumnMatches(text, () => false, isOrgShaped).org,
    ]),
};
