/**
 * Regressions from the frozen 2026-08-29 final public-share campaign.
 * Every case was first reproduced against the deployed v1.5.4 UI.
 */
import { describe, expect, it } from 'vitest';
import { buildCleanText } from '../sanitize';
import { scanText } from '../scan';

const clean = (text: string) => buildCleanText(text, scanText(text));

describe('multiline secret values', () => {
  it('redacts a YAML block scalar body without breaking its indentation', () => {
    const source = 'secret_key: |\n  line-one!\n  line-two$';
    expect(clean(source)).toBe('secret_key: |\n  [SECRET_1]');
  });

  it('stops a folded block at the first dedented field', () => {
    const source = 'password: >-\n  first line\n  second line\nstatus: active';
    expect(clean(source)).toBe('password: >-\n  [SECRET_1]\nstatus: active');
  });

  it.each([
    'password: |\nstatus: active',
    'password: |\n  {{ vault_password }}\nstatus: active',
    'password: |-\n  ${VAULT_PASSWORD}\nstatus: active',
  ])('does not redact a block with no literal secret: %s', (source) => {
    expect(clean(source)).toBe(source);
  });
});

describe('ordinary CLI credential forms', () => {
  it.each([
    ["sshpass -p 'demo ssh pass' ssh host", 'demo ssh pass'],
    ['az login --service-principal -u client-id -p TenantSecret!42 --tenant tenant-id', 'TenantSecret!42'],
    [String.raw`net use \\server\share /user:DEMO\alex Demo!4455`, 'Demo!4455'],
  ])('redacts the literal password in %s', (source, secret) => {
    const output = clean(source);
    expect(output).not.toContain(secret);
    expect(output).toContain('[SECRET_1]');
  });

  it.each([
    'sshpass -p "$SSH_PASSWORD" ssh host',
    'az login --service-principal -u client-id -p $CLIENT_SECRET --tenant tenant-id',
    String.raw`net use \\server\share /user:DEMO\alex *`,
  ])('preserves a runtime credential reference in %s', (source) => {
    expect(clean(source)).not.toContain('[SECRET_');
  });
});

describe('credential pairs in common developer syntax', () => {
  it.each([
    ['curl -u apiuser:p@ss:w0rd https://service.internal.example/v1', 'apiuser:p@ss:w0rd'],
    ["requests.get(url, auth=('agentuser', 'r3quest$pass'))", "('agentuser', 'r3quest$pass')"],
    ["Buffer.from('svc-ci:P!pe|line 7').toString('base64')", 'svc-ci:P!pe|line 7'],
    ['redis://:Cache$Secret@10.2.3.4:6379/0', 'redis://:Cache$Secret@10.2.3.4:6379/0'],
  ])('redacts %s as one complete credential-bearing value', (source, secretSpan) => {
    const output = clean(source);
    expect(output).not.toContain(secretSpan);
    expect(output).toContain('[CONNECTION_STRING_1]');
  });

  it.each([
    'curl https://service.internal.example/v1',
    'requests.get(url, auth=(username, password))',
    "Buffer.from(payload).toString('base64')",
    'redis://cache01:6379/0',
    'curl -u user:password https://example.com',
    "requests.get(url, auth=('username', 'password'))",
    "Buffer.from('user:password').toString('base64')",
  ])('does not invent a credential in %s', (source) => {
    expect(scanText(source).some((finding) => finding.detectorId === 'connection-string')).toBe(false);
  });
});

describe('provider boundaries', () => {
  const telegram = `123456789:AA${'b'.repeat(33)}`;
  const githubBody = 'A'.repeat(36);

  it('finds a Telegram token in its canonical bot API URL', () => {
    expect(clean(`https://api.telegram.org/bot${telegram}/sendMessage`)).not.toContain(telegram);
  });

  it('does not swallow an adjacent password field into a GitHub token finding', () => {
    const source = `token=ghp_${githubBody}password=NoDelimiter!7`;
    expect(clean(source)).toBe('token=[API_KEY_1]password=[SECRET_1]');
  });

  it.each([
    'xoxb-not-a-real-token',
    `AIza${'A'.repeat(34)}`,
  ])('leaves an obvious provider near-miss alone: %s', (source) => {
    expect(clean(source)).toBe(source);
  });
});

describe('structured usernames', () => {
  it.each([
    ['{"username":"buildbot"}', 'buildbot'],
    [String.raw`/user:DEMO\alex`, String.raw`DEMO\alex`],
  ])('redacts the complete username in %s', (source, username) => {
    const output = clean(source);
    expect(output).not.toContain(username);
    expect(output).toContain('[USERNAME_1]');
  });

  it('keeps an environment variable-style user field conservative', () => {
    expect(clean('DB_USER=appsvc')).toBe('DB_USER=appsvc');
  });

  it('does not treat ordinary login prose as a username', () => {
    expect(clean('The login is successful.')).toBe('The login is successful.');
  });

  it.each([
    ["$cred = New-Object PSCredential('LAB\\deploysvc', $secure)", 'LAB\\deploysvc'],
    ["$cred = [PSCredential]::new('LAB\\deploysvc', $secure)", 'LAB\\deploysvc'],
  ])('redacts a literal PSCredential username in %s', (source, username) => {
    expect(clean(source)).not.toContain(username);
  });

  it('does not redact a PSCredential username variable', () => {
    const source = '$cred = [PSCredential]::new($username, $secure)';
    expect(clean(source)).toBe(source);
  });
});

describe('contextual hosts and credential hashes', () => {
  it.each([
    'cmdkey /add:server22 /user:backupsvc /pass:Blue-Sky_77',
    'smtp auth rejected host=mail.private.example',
    'AuthenticationError at redis01.lab:6379',
    'Endpoint=sb://demo-bus.servicebus.windows.net/;SharedAccessKey=demo',
  ])('redacts the contextual host in %s', (source) => {
    expect(scanText(source).some((finding) => finding.detectorId === 'internal-hostname')).toBe(true);
  });

  it.each(['host=available', 'api.github.com'])('does not invent a private host in %s', (source) => {
    expect(scanText(source).some((finding) => finding.detectorId === 'internal-hostname')).toBe(false);
  });

  it('redacts a labeled NTLM hash', () => {
    expect(clean('ntlm=8846F7EAEE8FB117AD06BDD830B7586C')).toBe('ntlm=[SECRET_1]');
  });

  it('leaves a generic SHA-256 digest alone', () => {
    const source = 'sha256: 9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    expect(clean(source)).toBe(source);
  });

  it('redacts an Azure Storage account name beside its account key', () => {
    const source = 'DefaultEndpointsProtocol=https;AccountName=demostore;AccountKey=demo';
    expect(clean(source)).toContain('AccountName=[USERNAME_1]');
  });
});

describe('support-text password cues', () => {
  it.each([
    ['temp password is Spring! 2026', 'Spring! 2026'],
    ['AuthenticationError: invalid password red!s-pass at redis01.lab', 'red!s-pass'],
  ])('redacts the obvious literal in %s', (source, secret) => {
    expect(clean(source)).not.toContain(secret);
  });

  it.each([
    'The password is incorrect.',
    'AuthenticationError: invalid password supplied',
    'AuthenticationError: invalid password reset-request',
    'The temporary password is unavailable.',
    'The current password is not available.',
  ])('does not redact ordinary prose: %s', (source) => {
    expect(clean(source)).toBe(source);
  });
});

describe('common non-secret placeholders', () => {
  it.each([
    'password: {{ vault_password }}',
    'API_KEY=<YOUR_API_KEY>',
    'TOKEN=changeme',
  ])('preserves %s', (source) => {
    expect(clean(source)).toBe(source);
  });
});
