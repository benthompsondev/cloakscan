/**
 * Redaction output formats. A format is just a placeholder template using at
 * most two tokens: {TYPE} (the rule label, e.g. EMAIL) and {INDEX} (the
 * per-label counter). Templates are plain text — they are never evaluated,
 * and the original matched value can never appear in a placeholder because
 * there is no token for it.
 */

export type RedactionFormatId = 'indexed' | 'unnumbered' | 'uniform' | 'custom';

export interface RedactionChoice {
  id: RedactionFormatId;
  /** Only used when id === 'custom'. */
  customTemplate: string;
}

export const DEFAULT_TEMPLATE = '[{TYPE}_{INDEX}]';

export const FORMAT_PRESETS: {
  id: RedactionFormatId;
  name: string;
  template: string;
  description: string;
}[] = [
  {
    id: 'indexed',
    name: 'Indexed labels',
    template: DEFAULT_TEMPLATE,
    description: 'Numbered by type, e.g. [EMAIL_1]. Repeated values keep their number. Default.',
  },
  {
    id: 'unnumbered',
    name: 'Unnumbered labels',
    template: '[{TYPE}]',
    description: 'Type only, e.g. [EMAIL]. Different values of one type become identical.',
  },
  {
    id: 'uniform',
    name: 'Uniform replacement',
    template: '[REDACTED]',
    description: 'Everything becomes [REDACTED]. Maximum uniformity, least readable.',
  },
  {
    id: 'custom',
    name: 'Custom template',
    template: DEFAULT_TEMPLATE,
    description: 'Your own text using only {TYPE} and {INDEX}, e.g. <{TYPE}-{INDEX}>.',
  },
];

const TOKEN_RE = /\{([^{}]*)\}/g;
const ALLOWED_TOKENS = new Set(['TYPE', 'INDEX']);
const ALLOWED_CHARS_RE = /^[A-Za-z0-9 _\-[\]{}()<>#:.]*$/;
/** Outside the allowed charset, so it can only come from our own substitution. */
const UNKNOWN_TOKEN_SENTINEL = '\u0001';

/** Validate a custom template. Returns a user-facing error, or null when valid. */
export function validateTemplate(template: string): string | null {
  if (template.length === 0) return 'Template cannot be empty.';
  if (template.length > 40) return 'Template must be 40 characters or fewer.';
  if (!ALLOWED_CHARS_RE.test(template)) {
    return 'Only letters, numbers, spaces, and _ - [ ] { } ( ) < > # : . are allowed.';
  }
  const withoutTokens = template.replace(TOKEN_RE, (_, token: string) =>
    ALLOWED_TOKENS.has(token) ? '' : UNKNOWN_TOKEN_SENTINEL,
  );
  if (withoutTokens.includes(UNKNOWN_TOKEN_SENTINEL)) {
    return 'Unknown token: only {TYPE} and {INDEX} are supported.';
  }
  if (withoutTokens.includes('{') || withoutTokens.includes('}')) {
    return 'Unmatched brace: braces may only form {TYPE} or {INDEX}.';
  }
  return null;
}

/** The effective template for a redaction choice, falling back to the default. */
export function templateFor(choice: RedactionChoice): string {
  if (choice.id === 'custom') {
    return validateTemplate(choice.customTemplate) === null
      ? choice.customTemplate
      : DEFAULT_TEMPLATE;
  }
  return FORMAT_PRESETS.find((f) => f.id === choice.id)?.template ?? DEFAULT_TEMPLATE;
}

/** Render one placeholder. Pure string substitution — nothing is executed. */
export function renderPlaceholder(template: string, type: string, index: number): string {
  return template.replaceAll('{TYPE}', type).replaceAll('{INDEX}', String(index));
}
