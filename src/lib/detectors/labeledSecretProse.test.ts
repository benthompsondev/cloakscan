/**
 * Regressions from the independent adjudication of the 2026-08-30 Deep
 * Assurance Lab campaign against v1.5.6.
 *
 * Three of the promoted findings were real. Each case below was reproduced
 * against the shipped v1.5.6 build first, and each sits beside the close
 * positives and negatives that stop the fix from becoming a miss or
 * resurrecting the ordinary-prose false positives fixed in v1.5.6.
 * Every value is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { buildCleanText } from '../sanitize';
import { scanText } from '../scan';

const clean = (text: string) => buildCleanText(text, scanText(text));

describe('a labeled secret in prose is not missed because of a qualifier', () => {
  // The cue required the qualifier to sit directly against the noun, so
  // "current prod password is" and "the secret is" never matched at all.
  it.each([
    ['qualifier between cue and noun', 'The current prod password is hunter2-rotate-now.', 'hunter2-rotate-now'],
    ['admin qualifier', 'The temporary admin password is Welcome2026!', 'Welcome2026!'],
    ['bare noun', 'The secret is Password123!', 'Password123!'],
    ['bare password noun', 'The password is Password123!', 'Password123!'],
    ['was instead of is', 'The old root password was Tr0ub4dor-3.', 'Tr0ub4dor-3'],
  ])('redacts %s', (_name, source, secret) => {
    const output = clean(source);
    expect(output).not.toContain(secret);
    expect(output).toContain('[SECRET_1]');
  });

  // The v1.5.6 guard judges the first token, so a sentence that simply
  // carries on is still left alone. A bare count is a sentence, not a
  // credential: "the password is 12 characters long".
  it.each([
    'The secret to success is boring verification.',
    'The password is incorrect.',
    'The password is required to be at least 12 characters long.',
    'The password is 12 characters long.',
    'The password is 8 characters minimum.',
    'The new password is stored in the vault under app/prod.',
    'The current password is unknown at this time.',
    'The temporary password is case-sensitive.',
    'The secret is safe with me.',
    'A temporary password is emailed to the address on file.',
  ])('leaves %s unchanged', (source) => {
    expect(clean(source)).toBe(source);
  });
});

describe('a type annotation is not a secret value', () => {
  // `apiKey: string;` was redacted as a secret, which turns valid
  // TypeScript into code that no longer parses.
  it.each([
    'interface Config {\n  apiKey: string;\n  apiSecret: string;\n  endpoint: string;\n}',
    'interface Config {\n  password: boolean;\n  apiKey: number;\n}',
    'interface Config {\n  secret: string | null;\n  token: string | undefined;\n}',
    'type Creds = {\n  password: string[];\n};',
    'const c: { apiKey: unknown } = load();',
    'interface C { apiKey: string; }',
    'type T = { password: string; token: string };',
  ])('leaves %s unchanged', (source) => {
    expect(clean(source)).toBe(source);
  });

  it.each([
    ['quoted literal', 'const c = { apiKey: "sk-live-abcdef123456" };', 'sk-live-abcdef123456'],
    ['unquoted literal', 'apiKey: hunter2-not-a-type', 'hunter2-not-a-type'],
    ['a value that merely starts with a type word', 'password: string-cheese-42', 'string-cheese-42'],
    ['quoted type word', 'password: "string"', 'string'],
    ['equals-assigned type word', 'apiKey=number', 'number'],
  ])('still redacts %s', (_name, source, secret) => {
    expect(clean(source)).not.toContain(secret);
  });
});

describe('a package version is not an email address', () => {
  // `react@18.2.0` was redacted as EMAIL because the domain part allowed an
  // all-numeric last label. No TLD is numeric.
  it.each([
    'Install react@18.2.0 and vite@8.1.2 today.',
    'npm install typescript@6.0.3',
    '"dependencies": { "react": "react@18.2.0" }',
    'pkg@1.2.3-beta.4 is the tag',
  ])('leaves %s unchanged', (source) => {
    expect(clean(source)).toBe(source);
  });

  it.each([
    ['ordinary address', 'Contact alice@example.com for access.', 'alice@example.com'],
    ['internal zone', 'Mail svc@app.internal now.', 'svc@app.internal'],
    ['tenant domain', 'UPN is user@contoso.onmicrosoft.com', 'user@contoso.onmicrosoft.com'],
    ['numeric labels before an alphabetic TLD', 'Write to ops@123.example.com today.', 'ops@123.example.com'],
  ])('still redacts an %s', (_name, source, address) => {
    expect(clean(source)).not.toContain(address);
  });
});

describe('a credential named in prose stops at the end of its sentence', () => {
  it('does not swallow the sentence that follows it', () => {
    const source =
      'Email alice@example.com and bob@example.org. The secret is Password123! Also charlie@sub.example.com.';
    const output = clean(source);

    expect(output).not.toContain('Password123!');
    // The three addresses after the credential must still be redacted rather
    // than consumed into it, and their sentence must survive.
    expect(output).toContain('Also');
    expect(output.match(/\[EMAIL_\d+\]/g)).toHaveLength(3);
  });

  it('keeps a value whose exclamation mark is part of the credential', () => {
    expect(clean('temp password is Spring! 2026')).toBe('temp password is [SECRET_1]');
  });

  it('keeps the clause after a comma', () => {
    expect(clean('The staging password is Wint3r2026, please rotate it.')).toBe(
      'The staging password is [SECRET_1], please rotate it.',
    );
  });

  it('keeps the clause after a spaced dash', () => {
    expect(clean('Your temporary password is Welcome2026! - change it on first login.')).toBe(
      'Your temporary password is [SECRET_1] - change it on first login.',
    );
  });
});
