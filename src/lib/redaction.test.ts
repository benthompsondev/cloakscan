import { describe, expect, it } from 'vitest';
import { renderPlaceholder, templateFor, validateTemplate } from './redaction';
import { scanText } from './scan';
import { buildCleanText } from './sanitize';

const SAMPLE = 'mail a@example.internal and b@example.internal from 10.0.0.5, cc a@example.internal';

function cleaned(template: string): string {
  const findings = scanText(SAMPLE, { placeholderTemplate: template });
  return buildCleanText(SAMPLE, findings);
}

describe('redaction formats', () => {
  it('indexed labels (default) stay stable', () => {
    expect(cleaned('[{TYPE}_{INDEX}]')).toBe(
      'mail [EMAIL_1] and [EMAIL_2] from [IP_ADDRESS_1], cc [EMAIL_1]',
    );
  });

  it('unnumbered labels collapse to the type', () => {
    expect(cleaned('[{TYPE}]')).toBe('mail [EMAIL] and [EMAIL] from [IP_ADDRESS], cc [EMAIL]');
  });

  it('uniform replacement redacts everything identically', () => {
    expect(cleaned('[REDACTED]')).toBe(
      'mail [REDACTED] and [REDACTED] from [REDACTED], cc [REDACTED]',
    );
  });

  it('custom templates render with both tokens', () => {
    expect(cleaned('<{TYPE}-{INDEX}>')).toBe(
      'mail <EMAIL-1> and <EMAIL-2> from <IP_ADDRESS-1>, cc <EMAIL-1>',
    );
  });

  it('keeps placeholder reuse deterministic in every format', () => {
    for (const template of ['[{TYPE}_{INDEX}]', '[{TYPE}]', '[REDACTED]', '<{TYPE}:{INDEX}>']) {
      const findings = scanText(SAMPLE, { placeholderTemplate: template });
      const emailPlaceholders = findings
        .filter((f) => f.value === 'a@example.internal')
        .map((f) => f.placeholder);
      expect(new Set(emailPlaceholders).size).toBe(1);
    }
  });
});

describe('template validation', () => {
  it('accepts the presets and reasonable custom templates', () => {
    expect(validateTemplate('[{TYPE}_{INDEX}]')).toBeNull();
    expect(validateTemplate('[{TYPE}]')).toBeNull();
    expect(validateTemplate('[REDACTED]')).toBeNull();
    expect(validateTemplate('<{TYPE}-{INDEX}>')).toBeNull();
    expect(validateTemplate('MASKED_{INDEX}')).toBeNull();
  });

  it('rejects empty, oversized, and unknown-token templates', () => {
    expect(validateTemplate('')).toMatch(/empty/);
    expect(validateTemplate('x'.repeat(41))).toMatch(/40 characters/);
    expect(validateTemplate('[{VALUE}]')).toMatch(/Unknown token/);
    expect(validateTemplate('{TYPE}{ORIGINAL}')).toMatch(/Unknown token/);
    expect(validateTemplate('{{TYPE}}')).toMatch(/brace|Unknown token/);
    expect(validateTemplate('[{TYPE]')).toMatch(/brace|Unknown token/);
  });

  it('rejects characters outside the safe set', () => {
    expect(validateTemplate('<script>{TYPE}</script>')).toMatch(/allowed/);
    expect(validateTemplate('{TYPE}`rm`')).toMatch(/allowed/);
  });

  it('falls back to the default template when a custom template is invalid', () => {
    expect(templateFor({ id: 'custom', customTemplate: '{NOPE}' })).toBe('[{TYPE}_{INDEX}]');
    expect(templateFor({ id: 'custom', customTemplate: '<{TYPE}>' })).toBe('<{TYPE}>');
  });

  it('renderPlaceholder is pure text substitution', () => {
    expect(renderPlaceholder('<{TYPE}-{INDEX}>', 'EMAIL', 3)).toBe('<EMAIL-3>');
    expect(renderPlaceholder('[REDACTED]', 'EMAIL', 3)).toBe('[REDACTED]');
  });
});
