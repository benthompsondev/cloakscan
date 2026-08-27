import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * Well-known API key formats. One small pattern per provider family keeps
 * this list easy to review and extend.
 */
const API_KEY_PATTERNS: RegExp[] = [
  /\bsk[-_](?:live|test)[-_][A-Za-z0-9]{8,}\b/g, // Stripe-style
  /\bsk-proj-[A-Za-z0-9_-]{20,}\b/g, // OpenAI project key
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, // AWS long-term or temporary access key ID
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
  /\bsk-ant-(?:api03-)?[A-Za-z0-9_-]{20,}\b/g, // Anthropic API key
  /\bglpat-[A-Za-z0-9_-]{20,}\b/g, // GitLab personal/project access token
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g, // GitHub fine-grained token
  /\b[rp]k_(?:live|test)_[A-Za-z0-9]{10,}\b/g, // Stripe restricted/publishable key
  /\b(?:AC|SK)[0-9a-fA-F]{32}\b/g, // Twilio account/API key SID
  /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/g, // SendGrid API key
  /\bnpm_[A-Za-z0-9]{36}\b/g, // npm access token
  /\bya29\.[A-Za-z0-9_-]{20,}\b/g, // Google OAuth access token
  /\bAccountKey=[A-Za-z0-9+/]{86,}==/g, // Azure Storage account key assignment
  /https:\/\/hooks\.slack\.com\/services\/T[A-Za-z0-9]{8,}\/B[A-Za-z0-9]{8,}\/[A-Za-z0-9_-]{20,}/g, // Slack incoming webhook
  /\bAuthorization:[ \t]*Basic[ \t]+[A-Za-z0-9+/]{12,}={0,2}/gi, // HTTP Basic authorization header
  /\bdop_v1_[0-9a-f]{64}\b/g, // DigitalOcean personal access token
  /\bpypi-[A-Za-z0-9_-]{50,}\b/g, // PyPI upload token
  /\bdckr_pat_[A-Za-z0-9_-]{20,}\b/g, // Docker access token
  /\bhf_[A-Za-z0-9]{30,}\b/g, // Hugging Face user access token
  /\bhvs\.[A-Za-z0-9_-]{20,}\b/g, // HashiCorp Vault service token
  /\bdapi[0-9a-f]{32}\b/g, // Databricks personal access token
  /\bshp(?:at|ca|pa|ss)_[0-9a-f]{32}\b/g, // Shopify access tokens
  /\bglrt-[A-Za-z0-9_-]{20,}\b/g, // GitLab runner authentication token
  /\bnfp_[A-Za-z0-9]{30,}\b/g, // Netlify personal access token
  /\bxkeysib-[0-9a-f]{64}\b/g, // Brevo API key
  /\bAGE-SECRET-KEY-1[A-Z0-9]{58}\b/g, // age identity secret key
  /https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g, // Discord webhook
  /\b\d{8,10}:AA[A-Za-z0-9_-]{32,33}\b/g, // Telegram bot token
  /(?<=[?&]sig=)[A-Za-z0-9%+/_=-]{20,}/gi, // Azure SAS signature value
  /(?<=[?&]X-Amz-Signature=)[0-9a-f]{64}(?=&|$)/gi, // S3 presigned URL signature value
];

export const apiKeyDetector: Detector = {
  id: 'api-key',
  name: 'API key',
  category: 'secrets',
  severity: 'high',
  label: 'API_KEY',
  priority: 92,
  explanation: 'Matches a known API key format. Leaked keys grant direct account access.',
  detect: (text) => API_KEY_PATTERNS.flatMap((re) => regexMatches(text, re)),
};

/** "Bearer <token>" — the scheme word plus the credential that follows it. */
const BEARER_RE = /\bBearer\s+[A-Za-z0-9\-._~+/]{8,}=*/g;

export const bearerTokenDetector: Detector = {
  id: 'bearer-token',
  name: 'Bearer token',
  category: 'secrets',
  severity: 'high',
  label: 'TOKEN',
  priority: 95,
  explanation: 'Authorization bearer tokens allow anyone holding them to act as the user.',
  detect: (text) => regexMatches(text, BEARER_RE),
};

/**
 * JWT-shaped tokens: three base64url segments where the header starts with
 * "eyJ" ({" in base64). Signature segment may be empty (alg "none").
 */
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/g;

export const jwtDetector: Detector = {
  id: 'jwt',
  name: 'JWT token',
  category: 'secrets',
  severity: 'high',
  label: 'TOKEN',
  priority: 90,
  explanation: 'JWTs often carry live session credentials and decodable identity claims.',
  detect: (text) => regexMatches(text, JWT_RE),
};

/** Sensitive field names. Prefixes cover compound names such as OPENAI_API_KEY. */
const SECRET_KEY_PATTERN = String.raw`[A-Za-z0-9_.-]{0,40}(?:password|passwd|passphrase|secret|credential|pass|pwd|api[-_]?key|auth[-_]?token|access[-_]?token|refresh[-_]?token|token)`;

/** Assignment labels, including quoted JSON keys and PowerShell variables. */
const ASSIGNMENT_LABEL_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_])(["']?)(${SECRET_KEY_PATTERN})\1[ \t]*(?::=|=|:)[ \t]*`,
  'gi',
);

/** CLI arguments whose literal value follows the flag rather than an equals sign. */
const CLI_SECRET_RE = new RegExp(
  String.raw`(?<![A-Za-z0-9_-])(?:--?|/)${SECRET_KEY_PATTERN}[ \t]+`,
  'gi',
);

/** Simple same-line XML secret elements. Attributes are deliberately not crossed. */
const XML_SECRET_RE = new RegExp(
  String.raw`<(${SECRET_KEY_PATTERN})(?:[ \t]+[^>\r\n]*)?>([^<\r\n]+)</\1[ \t]*>`,
  'gi',
);

const XML_TAG_RE = /<[A-Za-z_:][^>\r\n]*>/g;

/** A following field assignment terminates an unquoted value on the same line. */
const NEXT_FIELD_RE =
  /[ \t]+(?=["']?[A-Za-z_][A-Za-z0-9_.-]{0,63}["']?[ \t]*(?::=|=|:))/i;

/** Placeholder-looking values we should not re-flag, e.g. [SECRET_1] or <redacted>. */
const LOOKS_REDACTED =
  /^(?:<(?:redacted|removed|hidden)>|x{4,}|\*{4,}|redacted|removed|hidden|none|null)$/i;
const NUMBERED_BRACKET_PLACEHOLDER = /^\[[A-Z][A-Z0-9_]*_[0-9]+\]$/;
const COMMON_BRACKET_PLACEHOLDER = /^\[(?:redacted|secret|hidden|removed)\]$/i;

/** Config words that follow pass/secret-style keys but are not credentials. */
const BOOLEANISH = new Set([
  'true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none', 'default', 'auto',
  'enabled', 'disabled', 'prompt', 'continue', 'stop', 'silentlycontinue', 'ignore', 'inquire',
]);

function isLikelySecretValue(value: string, quote: '"' | "'" | null = null): boolean {
  if (
    LOOKS_REDACTED.test(value) ||
    NUMBERED_BRACKET_PLACEHOLDER.test(value) ||
    COMMON_BRACKET_PLACEHOLDER.test(value)
  ) {
    return false;
  }
  if (quote !== "'" && /\$(?:\(|\{|[A-Za-z_][A-Za-z0-9_:]*)/.test(value)) return false;
  if (BOOLEANISH.has(value.toLowerCase())) return false;
  if (!quote && /^\(?[A-Za-z]+-[A-Za-z0-9]+(?:\)?(?:[ \t]|$))/.test(value)) return false;
  return true;
}

function looksExecutableValue(value: string): boolean {
  const trimmed = value.trimStart();
  return (
    /^@(?:\(|\{|["'][ \t]*$)/.test(trimmed) ||
    /^&(?:[ \t]+|["'$])/.test(trimmed) ||
    /^(?:\.{1,2}[\\/])\S+\.(?:ps1|psm1|psd1|bat|cmd|exe)\b/i.test(trimmed) ||
    /^\[[A-Za-z_][A-Za-z0-9_.]*(?:\[\])?\][ \t]*(?=\S)/.test(trimmed) ||
    /^\{[ \t]*(?:[$&]|[A-Za-z_][A-Za-z0-9_.-]*(?:[ \t]+|[ \t]*\())/.test(trimmed) ||
    /^\.\s/.test(trimmed) ||
    /^[A-Za-z_][A-Za-z0-9_.-]*[ \t]*\(/.test(trimmed) ||
    /^\([A-Za-z_][A-Za-z0-9_.-]*[ \t]*\(/.test(trimmed) ||
    /^\([A-Z][A-Za-z0-9_.-]*[A-Z][A-Za-z0-9_.-]*\)/.test(trimmed) ||
    /^[A-Za-z_][A-Za-z0-9_.-]*[ \t]+-[A-Za-z]/.test(trimmed)
  );
}

function lineEnd(text: string, start: number): number {
  let end = start;
  while (end < text.length && text[end] !== '\r' && text[end] !== '\n') end += 1;
  return end;
}

function hasPowerShellVariablePrefix(text: string, labelStart: number): boolean {
  const lineStart = Math.max(text.lastIndexOf('\n', labelStart - 1), text.lastIndexOf('\r', labelStart - 1));
  return /\$(?:[A-Za-z_][A-Za-z0-9_]*:)?$/i.test(text.slice(lineStart + 1, labelStart));
}

function findClosingQuote(text: string, valueStart: number, endOfLine: number): number {
  const quote = text[valueStart];
  for (let index = valueStart + 1; index < endOfLine; index += 1) {
    if (text[index] !== quote) continue;

    let backslashes = 0;
    for (let cursor = index - 1; cursor > valueStart && text[cursor] === '\\'; cursor -= 1) {
      backslashes += 1;
    }
    if (backslashes % 2 === 1 || text[index - 1] === '`') continue;
    if (quote === "'" && text[index + 1] === "'") {
      index += 1;
      continue;
    }
    return index;
  }
  return endOfLine;
}

function captureValue(
  text: string,
  valueStart: number,
  options: { cliToken?: boolean; powerShellAssignment?: boolean } = {},
): RawMatch | null {
  const endOfLine = lineEnd(text, valueStart);
  const quote = text[valueStart];
  if (quote === '"' || quote === "'") {
    const valueEnd = findClosingQuote(text, valueStart, endOfLine);
    const value = text.slice(valueStart + 1, valueEnd);
    if (!value || !isLikelySecretValue(value, quote)) return null;
    return { start: valueStart + 1, end: valueEnd, value, confidence: 'medium' };
  }

  let valueEnd = endOfLine;
  const tail = text.slice(valueStart, endOfLine);
  if (looksExecutableValue(tail)) return null;
  if (options.cliToken) {
    if (/^(?:--?|\/)[A-Za-z]/.test(tail)) return null;
    const whitespace = tail.search(/[ \t]/);
    if (whitespace !== -1) valueEnd = valueStart + whitespace;
  } else {
    const nextField = tail.search(NEXT_FIELD_RE);
    if (nextField !== -1) valueEnd = Math.min(valueEnd, valueStart + nextField);
    const structuredSeparator = tail.search(
      /[,;}][ \t]*(?=["']?[A-Za-z_][A-Za-z0-9_.-]{0,63}["']?[ \t]*(?::=|=|:))/,
    );
    if (structuredSeparator !== -1) {
      valueEnd = Math.min(valueEnd, valueStart + structuredSeparator);
    }
    const querySeparator = tail.search(/&(?=[A-Za-z_][A-Za-z0-9_.-]{0,63}=)/);
    if (querySeparator !== -1) valueEnd = Math.min(valueEnd, valueStart + querySeparator);
    const comment = tail.search(/[ \t]+(?:#|\/\/)/);
    if (comment !== -1) valueEnd = Math.min(valueEnd, valueStart + comment);
  }

  while (valueEnd > valueStart && /[ \t]/.test(text[valueEnd - 1])) valueEnd -= 1;
  const value = text.slice(valueStart, valueEnd);
  if (options.powerShellAssignment) return null;
  if (!value || !isLikelySecretValue(value)) return null;
  return { start: valueStart, end: valueEnd, value, confidence: 'medium' };
}

function detectSecretAssignments(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const assignmentRe = new RegExp(ASSIGNMENT_LABEL_RE.source, ASSIGNMENT_LABEL_RE.flags);
  let assignment: RegExpExecArray | null;
  while ((assignment = assignmentRe.exec(text)) !== null) {
    const match = captureValue(text, assignment.index + assignment[0].length, {
      powerShellAssignment: hasPowerShellVariablePrefix(text, assignment.index),
    });
    if (match) {
      matches.push(match);
      assignmentRe.lastIndex = Math.max(assignmentRe.lastIndex, match.end);
    }
  }

  const cliRe = new RegExp(CLI_SECRET_RE.source, CLI_SECRET_RE.flags);
  let cli: RegExpExecArray | null;
  while ((cli = cliRe.exec(text)) !== null) {
    const match = captureValue(text, cli.index + cli[0].length, { cliToken: true });
    if (match) matches.push(match);
  }

  const xmlRe = new RegExp(XML_SECRET_RE.source, XML_SECRET_RE.flags);
  let xml: RegExpExecArray | null;
  while ((xml = xmlRe.exec(text)) !== null) {
    const value = xml[2].trim();
    if (!value || !isLikelySecretValue(value, "'")) continue;
    const relativeStart = xml[0].indexOf(xml[2]) + xml[2].indexOf(value);
    const start = xml.index + relativeStart;
    matches.push({ start, end: start + value.length, value, confidence: 'medium' });
  }

  const tagRe = new RegExp(XML_TAG_RE.source, XML_TAG_RE.flags);
  let tag: RegExpExecArray | null;
  while ((tag = tagRe.exec(text)) !== null) {
    const keyAttributeRe = new RegExp(
      String.raw`\b(?:key|name)[ \t]*=[ \t]*(["'])${SECRET_KEY_PATTERN}\1`,
      'i',
    );
    if (!keyAttributeRe.test(tag[0])) continue;
    const valueAttribute = /\bvalue[ \t]*=[ \t]*(["'])([^"']+)\1/i.exec(tag[0]);
    if (!valueAttribute || !isLikelySecretValue(valueAttribute[2], "'")) continue;
    const value = valueAttribute[2];
    const relativeStart = valueAttribute.index + valueAttribute[0].indexOf(value);
    const start = tag.index + relativeStart;
    matches.push({ start, end: start + value.length, value, confidence: 'medium' });
  }

  return matches;
}

export const secretAssignmentDetector: Detector = {
  id: 'secret-assignment',
  name: 'Password / secret assignment',
  category: 'secrets',
  severity: 'high',
  label: 'SECRET',
  priority: 80,
  explanation: 'A literal assigned to a password/secret-style key is treated as a credential.',
  detect: detectSecretAssignments,
};
