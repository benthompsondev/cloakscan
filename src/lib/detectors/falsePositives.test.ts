/**
 * False positives found in the independent second-opinion review of v1.5.5.
 *
 * Both groups come from rules v1.5.5 added. Each case below was reproduced
 * against the shipped v1.5.5 build before the fix, and each has a close
 * positive beside it so narrowing the rule cannot quietly become a miss.
 * Every value is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { buildCleanText } from '../sanitize';
import { scanText } from '../scan';

const clean = (text: string) => buildCleanText(text, scanText(text));

describe('support-text password cues do not eat ordinary sentences', () => {
  // The prose rule has no delimiter to stop at, so the captured value runs to
  // the end of the line. Judging that whole run against the non-secret list
  // never matched, and the rest of the sentence was replaced along with it.
  it.each([
    'The new password is required to be at least 12 characters long.',
    'The new password is stored in the vault under app/prod.',
    'The new password is set by the user at first logon.',
    'Your new password is different from the previous five.',
    'The current password is unknown at this time.',
    'The current password is still valid until Friday.',
    'The temporary password is expired, request a new one.',
    'The temporary password is case-sensitive.',
    'The default password is documented in the vendor manual.',
    'A temporary password is emailed to the address on file.',
  ])('leaves %s unchanged', (source) => {
    expect(clean(source)).toBe(source);
  });

  it.each([
    ['single token', 'Your temporary password is Welcome2026!', 'Welcome2026!'],
    ['token plus trailing clause', 'The temporary password is P@ssw0rd-2026 and expires soon.', 'P@ssw0rd-2026'],
    ['value containing a space', 'temp password is Spring! 2026', 'Spring! 2026'],
    ['default with digits', 'The default password is Admin123 on a factory unit.', 'Admin123'],
  ])('still redacts a credential-shaped value: %s', (_name, source, secret) => {
    const output = clean(source);
    expect(output).not.toContain(secret);
    expect(output).toContain('[SECRET_1]');
  });
});

describe('a credential pair built from runtime references is not a literal', () => {
  // sshpass and PSCredential already preserve `$VAR` style references. The
  // curl pair rules did not, so a documented command lost its variable names.
  it.each([
    'curl -u "$USER:$TOKEN" https://api.example.com/v1/me',
    'curl -u $USER:$PASSWORD https://api.example.com',
    "curl -u '${CI_USER}:${CI_TOKEN}' https://registry.example.com",
    'curl --user "%USERNAME%:%TOKEN%" https://api.example.com',
    'curl -u "$env:CI_USER:$env:CI_TOKEN" https://api.example.com',
  ])('leaves %s unchanged', (source) => {
    expect(clean(source)).toBe(source);
  });

  it.each([
    ['both sides literal', 'curl -u alice:Hunter2! https://api.example.com', 'alice:Hunter2!'],
    ['colon inside the password', 'curl -u apiuser:p@ss:w0rd https://example.com', 'apiuser:p@ss:w0rd'],
    ['literal user, referenced password', 'curl -u alice:$TOKEN https://api.example.com', 'alice:$TOKEN'],
    ['quoted literal pair', 'curl -u "svc-ci:P!peline7" https://api.example.com', 'svc-ci:P!peline7'],
  ])('still redacts a literal pair: %s', (_name, source, secret) => {
    const output = clean(source);
    expect(output).not.toContain(secret);
    expect(output).toContain('[CONNECTION_STRING_1]');
  });
});
