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
import { ticketIdDetector } from './tickets';
import { usernameDetector } from './usernames';
import { SYNTHETIC_STRIPE_SHAPED_KEY } from '../synthetic';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

describe('email detector', () => {
  it('finds standard addresses', () => {
    expect(values(emailDetector, 'Contact alex.demo@example.internal today')).toEqual([
      'alex.demo@example.internal',
    ]);
  });

  it('ignores non-addresses', () => {
    expect(values(emailDetector, 'not an email: foo@bar, @handle, a@b')).toEqual([]);
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

  it('marks loopback as low confidence', () => {
    const [m] = ipv4Detector.detect('listening on 127.0.0.1');
    expect(m.confidence).toBe('low');
  });
});

describe('secret detectors', () => {
  it('finds known API key formats', () => {
    expect(values(apiKeyDetector, `key=${SYNTHETIC_STRIPE_SHAPED_KEY}`)).toEqual([
      SYNTHETIC_STRIPE_SHAPED_KEY,
    ]);
    expect(values(apiKeyDetector, 'aws AKIAIOSFODNN7EXAMPLE done')).toEqual([
      'AKIAIOSFODNN7EXAMPLE',
    ]);
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
  it('finds Windows user paths', () => {
    expect(
      values(windowsPathDetector, String.raw`Log: C:\Users\alex.demo\AppData\Local\run.log ok`),
    ).toEqual([String.raw`C:\Users\alex.demo\AppData\Local\run.log`]);
  });

  it('finds Unix home paths', () => {
    expect(values(unixPathDetector, 'written to /home/ademo/deploy/run.log then')).toEqual([
      '/home/ademo/deploy/run.log',
    ]);
    expect(values(unixPathDetector, 'macOS /Users/ademo/notes.txt')).toEqual([
      '/Users/ademo/notes.txt',
    ]);
  });

  it('ignores non-user paths', () => {
    expect(values(windowsPathDetector, String.raw`C:\Windows\System32\drivers`)).toEqual([]);
    expect(values(unixPathDetector, '/var/log/syslog and /etc/hosts')).toEqual([]);
  });
});

describe('internal URL and hostname detectors', () => {
  it('flags internal-suffix URLs and skips public ones', () => {
    expect(
      values(internalUrlDetector, 'see https://admin.example.internal/api and https://github.com/x'),
    ).toEqual(['https://admin.example.internal/api']);
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
