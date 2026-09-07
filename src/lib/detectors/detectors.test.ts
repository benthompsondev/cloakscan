import { describe, expect, it } from 'vitest';
import { emailDetector } from './email';
import { ipv4Detector, isValidIpv4 } from './network';
import {
  apiKeyDetector,
  bearerTokenDetector,
  jwtDetector,
  secretAssignmentDetector,
} from './secrets';
import { windowsPathDetector, unixPathDetector } from './paths';
import { internalUrlDetector, internalHostnameDetector, looksInternalHost } from './internal';
import { portDetector } from './ports';
import { ticketIdDetector } from './tickets';
import { usernameDetector } from './usernames';
import {
  SYNTHETIC_AWS_ACCESS_KEY_ID,
  SYNTHETIC_AWS_TEMPORARY_ACCESS_KEY_ID,
  SYNTHETIC_PROVIDER_TOKENS,
  SYNTHETIC_STRIPE_SHAPED_KEY,
} from '../synthetic';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

describe('email detector', () => {
  it('finds standard addresses', () => {
    expect(values(emailDetector, 'Contact alex.demo@example.internal today')).toEqual([
      'alex.demo@example.internal',
    ]);
  });

  it('finds bare email-domain suffixes and labeled mail domains', () => {
    const text = [
      'UPN template: "$alias@example.org"',
      'MailDomain = "accounts.example.net"',
      'Accepted-Domain: branch.example.ca',
    ].join('\n');
    expect(values(emailDetector, text)).toEqual([
      '@example.org',
      'accounts.example.net',
      'branch.example.ca',
    ]);
  });

  it('keeps a full address as one finding instead of a nested domain fragment', () => {
    expect(values(emailDetector, 'Email: alex.demo@example.org')).toEqual([
      'alex.demo@example.org',
    ]);
  });

  it('ignores non-addresses', () => {
    expect(
      values(
        emailDetector,
        'not an email: foo@bar, @handle, a@b, public example.org, https://example.org',
      ),
    ).toEqual([]);
  });
});

describe('ipv4 detector', () => {
  it('finds valid addresses', () => {
    expect(values(ipv4Detector, 'host 10.42.16.28 and 172.16.5.10')).toEqual([
      '10.42.16.28',
      '172.16.5.10',
    ]);
  });

  it('rejects out-of-range octets and version-like strings', () => {
    expect(values(ipv4Detector, 'v999.1.1.1 and 300.1.2.3')).toEqual([]);
    expect(isValidIpv4('256.1.1.1')).toBe(false);
    expect(isValidIpv4('192.168.1.1')).toBe(true);
  });

  it('does not mistake four-part versions or longer dotted runs for addresses', () => {
    const text = [
      'app v1.2.3.4',
      'version 2.3.4.5',
      'ver=3.4.5.6',
      'rev: 4.5.6.7',
      'build 5.6.7.8',
      'release 6.7.8.9',
      'assembly 7.8.9.10',
      'FileVersion: 8.9.10.11',
      'AssemblyVersion = 9.10.11.12',
      'app_version=10.11.12.13',
      'long run 1.2.3.4.5',
    ].join('\n');
    expect(values(ipv4Detector, text)).toEqual([]);
  });

  it('allows short separators between a version cue and dotted quad', () => {
    const text = [
      'AssemblyVersion("4.0.0.0")',
      '<Version>1.0.0.0</Version>',
      '"version": "1.0.0.0"',
      'FileVersion = [2.3.4.5]',
      'build + 3.4.5.6',
    ].join('\n');
    expect(values(ipv4Detector, text)).toEqual([]);
  });

  it('still flags addresses after non-version labels', () => {
    expect(
      values(
        ipv4Detector,
        'Host IP: 10.20.30.40\nDNS server: 10.0.0.53\nPublic edge: 203.0.113.24',
      ),
    ).toEqual(['10.20.30.40', '10.0.0.53', '203.0.113.24']);
  });

  it('ignores non-sensitive special-purpose IPv4 values', () => {
    expect(
      values(ipv4Detector, 'loopback 127.0.0.1 127.42.3.9 bind 0.0.0.0 broadcast 255.255.255.255'),
    ).toEqual([]);
  });

  it('still flags private and public addresses', () => {
    expect(values(ipv4Detector, 'hosts 10.20.30.40 192.168.1.1 8.8.8.8')).toEqual([
      '10.20.30.40',
      '192.168.1.1',
      '8.8.8.8',
    ]);
  });
});

describe('secret detectors', () => {
  it('finds known API key formats', () => {
    expect(values(apiKeyDetector, `key=${SYNTHETIC_STRIPE_SHAPED_KEY}`)).toEqual([
      SYNTHETIC_STRIPE_SHAPED_KEY,
    ]);
    expect(values(apiKeyDetector, `aws ${SYNTHETIC_AWS_ACCESS_KEY_ID} done`)).toEqual([
      SYNTHETIC_AWS_ACCESS_KEY_ID,
    ]);
    expect(values(apiKeyDetector, `sts ${SYNTHETIC_AWS_TEMPORARY_ACCESS_KEY_ID} done`)).toEqual([
      SYNTHETIC_AWS_TEMPORARY_ACCESS_KEY_ID,
    ]);
  });

  it('finds fixed-prefix provider tokens and authorization credentials', () => {
    // Assemble Twilio shapes at runtime so GitHub push protection does not
    // mistake deliberately fake detector fixtures for live credentials.
    const twilioAccount = `AC${'0123456789abcdef'.repeat(2)}`;
    const twilioKey = `SK${'0123456789abcdef'.repeat(2)}`;
    const secrets = [
      'sk-ant-api03-THIS_IS_A_FAKE_ANTHROPIC_KEY_123456',
      'glpat-FAKEGITLABTOKEN_1234567890',
      'github_pat_FAKE_FINE_GRAINED_TOKEN_1234567890',
      'rk_live_FAKESTRIPE1234567890',
      'pk_test_FAKESTRIPE1234567890',
      twilioAccount,
      twilioKey,
      `SG.FAKE_SENDGRID_TOKEN_12.${'A'.repeat(43)}`,
      'npm_0123456789abcdefghijklmnopqrstuvwxyz',
      'ya29.FAKE_GOOGLE_OAUTH_TOKEN_1234567890',
      `AccountKey=${'A'.repeat(86)}==`,
      'https://hooks.slack.com/services/T01234567/B01234567/FAKEWEBHOOKTOKEN123456789012',
      'Authorization: Basic ZGVtby11c2VyOmZha2UtcGFzc3dvcmQ=',
    ];
    expect(values(apiKeyDetector, secrets.join('\n'))).toEqual(
      secrets.map((value) => value.replace(/^Authorization: /, '')),
    );
  });

  it.each([
    [
      'OpenAI project key',
      SYNTHETIC_PROVIDER_TOKENS.openAiProject,
      ['sk', 'proj', 'short'].join('-'),
    ],
    [
      'DigitalOcean token',
      SYNTHETIC_PROVIDER_TOKENS.digitalOcean,
      ['dop', 'v1', 'a'.repeat(63)].join('_'),
    ],
    [
      'PyPI token',
      SYNTHETIC_PROVIDER_TOKENS.pypi,
      ['pypi', 'A'.repeat(49)].join('-'),
    ],
    [
      'Docker token',
      SYNTHETIC_PROVIDER_TOKENS.docker,
      ['dckr', 'pat', 'A'.repeat(19)].join('_'),
    ],
    [
      'Hugging Face token',
      SYNTHETIC_PROVIDER_TOKENS.huggingFace,
      ['hf', 'A'.repeat(29)].join('_'),
    ],
    [
      'HashiCorp Vault token',
      SYNTHETIC_PROVIDER_TOKENS.hashicorpVault,
      ['hvs', 'A'.repeat(19)].join('.'),
    ],
    [
      'Databricks token',
      SYNTHETIC_PROVIDER_TOKENS.databricks,
      `dapi${'a'.repeat(31)}`,
    ],
    [
      'Shopify token',
      SYNTHETIC_PROVIDER_TOKENS.shopify,
      ['shpat', 'a'.repeat(31)].join('_'),
    ],
    [
      'GitLab runner token',
      SYNTHETIC_PROVIDER_TOKENS.gitlabRunner,
      ['glrt', 'A'.repeat(19)].join('-'),
    ],
    [
      'Netlify token',
      SYNTHETIC_PROVIDER_TOKENS.netlify,
      ['nfp', 'A'.repeat(29)].join('_'),
    ],
    [
      'Brevo xkeysib token',
      SYNTHETIC_PROVIDER_TOKENS.xKeySib,
      ['xkeysib', 'a'.repeat(63)].join('-'),
    ],
    [
      'age secret key',
      SYNTHETIC_PROVIDER_TOKENS.ageSecret,
      `${['AGE', 'SECRET', 'KEY'].join('-')}-1${'A'.repeat(57)}`,
    ],
    [
      'Discord webhook',
      SYNTHETIC_PROVIDER_TOKENS.discordWebhook,
      `https://${['discord', 'com'].join('.')}/api/webhooks/not-numeric/${'A'.repeat(32)}`,
    ],
    [
      'Telegram bot token',
      SYNTHETIC_PROVIDER_TOKENS.telegramBot,
      `${'1'.repeat(7)}:AA${'A'.repeat(32)}`,
    ],
  ])('finds a %s and rejects its malformed near-match', (_name, valid, invalid) => {
    expect(values(apiKeyDetector, `before ${valid} after`)).toEqual([valid]);
    expect(values(apiKeyDetector, `before ${invalid} after`)).toEqual([]);
  });

  it('finds only signature values behind Azure SAS and S3 query parameters', () => {
    const azureSignature = `DEMO${'A'.repeat(40)}%3D`;
    const s3Signature = 'a'.repeat(64);
    const text = [
      `https://storage.example.test/blob?sv=2025-01-01&sig=${azureSignature}&se=2030-01-01`,
      `https://bucket.example.test/object?X-Amz-Signature=${s3Signature}&X-Amz-Expires=300`,
    ].join('\n');
    expect(values(apiKeyDetector, text)).toEqual([azureSignature, s3Signature]);

    expect(values(apiKeyDetector, `sig=${azureSignature}`)).toEqual([]);
    expect(values(apiKeyDetector, `X-Amz-Signature=${'a'.repeat(63)}`)).toEqual([]);
  });

  it('finds bearer tokens including the scheme word', () => {
    const [m] = bearerTokenDetector.detect('Authorization: Bearer demo_token_not_real_4f8a72');
    expect(m.value).toBe('Bearer demo_token_not_real_4f8a72');
  });

  it('finds JWT-shaped tokens', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJkZW1vIjoibm90LXJlYWwifQ.ZmFrZS1zaWc';
    expect(values(jwtDetector, `token ${jwt} end`)).toEqual([jwt]);
  });

  it('flags only the value of a password assignment', () => {
    const [m] = secretAssignmentDetector.detect('password = "demo-not-real-1"');
    expect(m.value).toBe('demo-not-real-1');
  });

  it('skips already-redacted values', () => {
    expect(values(secretAssignmentDetector, 'password = [SECRET_1]')).toEqual([]);
    expect(values(secretAssignmentDetector, 'password: ********')).toEqual([]);
  });
});

describe('path detectors', () => {
  it('finds Windows paths, including quoted user paths with spaces', () => {
    expect(
      values(windowsPathDetector, String.raw`Log: C:\Users\alex.demo\AppData\Local\run.log ok`),
    ).toEqual([String.raw`C:\Users\alex.demo\AppData\Local\run.log`]);
    expect(
      values(
        windowsPathDetector,
        String.raw`Source: "C:\Users\Alex Demo\Documents\Private Project\deploy script.ps1"`,
      ),
    ).toEqual([String.raw`C:\Users\Alex Demo\Documents\Private Project\deploy script.ps1`]);
    expect(
      values(windowsPathDetector, String.raw`InstallPath = "D:\Operations Tools\Agent\config" ;`),
    ).toEqual([String.raw`D:\Operations Tools\Agent\config`]);
  });

  it('stops an unquoted path before the next PowerShell assignment', () => {
    const text = String.raw`Source: C:\Users\Alex Demo\Documents\deploy.ps1 $Target = D:\Ops\Output`;
    expect(values(windowsPathDetector, text)).toEqual([
      String.raw`C:\Users\Alex Demo\Documents\deploy.ps1`,
      String.raw`D:\Ops\Output`,
    ]);
  });

  it('finds Unix home paths', () => {
    expect(values(unixPathDetector, 'written to /home/ademo/deploy/run.log then')).toEqual([
      '/home/ademo/deploy/run.log',
    ]);
    expect(values(unixPathDetector, 'macOS /Users/ademo/notes.txt')).toEqual([
      '/Users/ademo/notes.txt',
    ]);
  });

  it('ignores drive labels and registry providers that are not file paths', () => {
    expect(values(windowsPathDetector, 'C: and HKLM:\\Software')).toEqual([]);
    expect(values(unixPathDetector, '/var/log/syslog and /etc/hosts')).toEqual([]);
  });
});

describe('internal URL and hostname detectors', () => {
  it('flags internal-suffix URLs and skips public ones', () => {
    expect(
      values(internalUrlDetector, 'see https://admin.example.internal/api and https://github.com/x'),
    ).toEqual(['https://admin.example.internal/api']);
  });

  it('flags LDAP URLs only when the host is internal-looking', () => {
    expect(
      values(
        internalUrlDetector,
        'bind ldaps://DC02.ad.contoso.com/CN=Users but skip ldap://example.com/CN=Users',
      ),
    ).toEqual(['ldaps://DC02.ad.contoso.com/CN=Users']);
  });

  it('flags private-IP and single-label URLs', () => {
    expect(looksInternalHost('10.0.0.5')).toBe(true);
    expect(looksInternalHost('intranet')).toBe(true);
    expect(looksInternalHost('example.com')).toBe(false);
  });

  it('finds bare internal hostnames', () => {
    expect(values(internalHostnameDetector, 'deployed on ws-144.example.internal today')).toEqual([
      'ws-144.example.internal',
    ]);
  });

  it('flags AD and Windows-server-shaped internal FQDNs on public suffixes', () => {
    expect(values(internalUrlDetector, 'open http://EXCH01.ad.contoso.on.ca/PowerShell/')).toEqual([
      'http://EXCH01.ad.contoso.on.ca/PowerShell/',
    ]);
    expect(values(internalHostnameDetector, 'replicate DC02.ad.contoso.com now')).toEqual([
      'DC02.ad.contoso.com',
    ]);
    expect(values(internalHostnameDetector, 'deploy SRV-APP01.corp.example.com')).toEqual([
      'SRV-APP01.corp.example.com',
    ]);
  });

  it('does not flag ordinary public or ad-tech domains as internal', () => {
    expect(
      values(
        internalUrlDetector,
        'https://api.github.com/repos/o/r https://example.com https://ad.doubleclick.net/pagead',
      ),
    ).toEqual([]);
    expect(values(internalHostnameDetector, 'api.github.com ad.doubleclick.net example.com')).toEqual([]);
  });
});

describe('network port detector', () => {
  it('finds common ports in infrastructure context', () => {
    expect(values(portDetector, 'Server: mail.contoso.local Port: 587')).toEqual(['587']);
    expect(values(portDetector, 'smtp.contoso.local:587 and 10.20.0.5:1433')).toEqual([
      '587',
      '1433',
    ]);
    expect(values(portDetector, 'SMTP port 465')).toEqual(['465']);
  });

  it('ignores bare numbers and uncommon ports', () => {
    expect(values(portDetector, '587 records processed, build 5432, v1.2.587')).toEqual([]);
    expect(values(portDetector, 'Port: 54321')).toEqual([]);
  });
});

describe('ticket detector', () => {
  it('finds clear service-ticket and Jira-style IDs', () => {
    expect(
      values(ticketIdDetector, 'INC104892 CHG543210 REQ123456 relates to OPS-2214'),
    ).toEqual([
      'INC104892',
      'CHG543210',
      'REQ123456',
      'OPS-2214',
    ]);
  });

  it('skips regex fragments, short tokens, and unseparated acronym numbers', () => {
    expect(
      values(
        ticketIdDetector,
        String.raw`'[^a-zA-Z0-9]' '[A-Z]{2,5}[0-9]{3,8}' ABC123 Z0 A-Z0-9 UTF-8 TLS-1`,
      ),
    ).toEqual([]);
  });
});

describe('username detector', () => {
  it('finds usernames in labeled contexts only', () => {
    expect(values(usernameDetector, 'Username: ademo logged in')).toEqual(['ademo']);
    expect(values(usernameDetector, 'ademo did something')).toEqual([]);
  });

  it('does not infer usernames from arbitrary AD group arguments', () => {
    expect(
      values(
        usernameDetector,
        'Add-ADGroupMember -Identity "Folder Redirection" -Members $SamAccountName',
      ),
    ).toEqual([]);
  });
});
