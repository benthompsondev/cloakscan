import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * Well-known API key formats. One small pattern per provider family keeps
 * this list easy to review and extend.
 */
const API_KEY_PATTERNS: RegExp[] = [
  /\bsk[-_](?:live|test)[-_][A-Za-z0-9]{8,}\b/g, // Stripe-style
  /\bsk-[A-Za-z0-9]{20,}\b/g, // OpenAI-style
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key ID
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, // GitHub tokens
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google API key
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

/**
 * Quoted literal assignments like password="...", client_secret: "...", and
 * compound variable names common in real scripts ($SmtpUserPass). Expressions,
 * variables, and command calls are deliberately excluded so sanitization
 * cannot turn executable PowerShell into placeholder text.
 */
const ASSIGNMENT_RE =
  /\b(?:[A-Za-z0-9_.-]{0,40}(?:password|passwd|passphrase|secret|credential|pass|pwd)|auth_token|access_token|refresh_token|api[-_]?key|token)\b\s*[:=]\s*(["'])([^"'\r\n]{4,})\1/gi;

/** Placeholder-looking values we should not re-flag, e.g. [SECRET_1] or <redacted>. */
const LOOKS_REDACTED = /^[[<*(]|^(?:x{4,}|\*{4,}|redacted|removed|hidden|none|null)$/i;

/** Config words that follow pass/secret-style keys but are not credentials. */
const BOOLEANISH = new Set([
  'true', 'false', 'yes', 'no', 'on', 'off', 'null', 'none', 'default', 'auto',
  'enabled', 'disabled', 'prompt', 'continue', 'stop', 'silentlycontinue', 'ignore', 'inquire',
]);

function isLikelySecretValue(value: string): boolean {
  if (LOOKS_REDACTED.test(value)) return false;
  if (value.startsWith('$') || value.includes('$(') || value.includes('${')) return false;
  if (BOOLEANISH.has(value.toLowerCase())) return false;
  return true;
}

export const secretAssignmentDetector: Detector = {
  id: 'secret-assignment',
  name: 'Password / secret assignment',
  category: 'secrets',
  severity: 'high',
  label: 'SECRET',
  priority: 80,
  explanation: 'A value assigned to a password/secret-style key is treated as a credential.',
  detect: (text): RawMatch[] =>
    regexMatches(text, ASSIGNMENT_RE, {
      group: 2,
      confidenceFor: (value) => (isLikelySecretValue(value) ? 'medium' : null),
    }),
};
