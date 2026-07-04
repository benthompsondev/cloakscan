import { describe, expect, it } from 'vitest';
import { privateKeyDetector } from './privatekeys';
import { connectionStringDetector } from './connections';
import { paymentCardDetector, isLikelyCardNumber, luhnValid } from './paymentcards';
import { phoneDetector, addressDetector, dobDetector, sinDetector, healthIdDetector, isValidSin } from './pii';
import { detectors } from './index';
import { RULE_INFO } from '../ruleInfo';
import { scanText } from '../scan';
import { buildCleanText } from '../sanitize';
import { enabledRuleIds, profileRuleStates } from '../profiles';
import { SYNTHETIC_STRIPE_SHAPED_KEY } from '../synthetic';

const values = (detector: { detect(text: string): { value: string }[] }, text: string) =>
  detector.detect(text).map((m) => m.value);

const strictIds = enabledRuleIds(profileRuleStates('strict'));

describe('registry metadata', () => {
  it('every registered rule has settings guidance and a synthetic sample', () => {
    for (const d of detectors) {
      expect(RULE_INFO[d.id], `RULE_INFO missing for ${d.id}`).toBeDefined();
    }
  });
});

describe('private key detector', () => {
  const pem = (kind: string, tail = 'PRIVATE KEY') =>
    `-----BEGIN ${kind}${tail}-----\nMIIDEMOxNOTxREALxxx\nabc123==\n-----END ${kind}${tail}-----`;

  it('finds PEM, RSA, EC, OpenSSH, and PGP blocks in full', () => {
    for (const kind of ['', 'RSA ', 'EC ', 'OPENSSH ', 'ENCRYPTED ']) {
      const block = pem(kind);
      expect(values(privateKeyDetector, `before\n${block}\nafter`)).toEqual([block]);
    }
    const pgp = `-----BEGIN PGP PRIVATE KEY BLOCK-----\nxcFGDEMO\n-----END PGP PRIVATE KEY BLOCK-----`;
    expect(values(privateKeyDetector, pgp)).toEqual([pgp]);
  });

  it('ignores public keys, certificates, and unterminated blocks', () => {
    expect(
      values(privateKeyDetector, '-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----'),
    ).toEqual([]);
    expect(
      values(privateKeyDetector, '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----'),
    ).toEqual([]);
    expect(values(privateKeyDetector, '-----BEGIN RSA PRIVATE KEY-----\nabc (no end marker)')).toEqual(
      [],
    );
  });

  it('redacts the whole multiline block as one placeholder, preserving surroundings', () => {
    const block = pem('RSA ');
    const text = `line one\n${block}\nline three`;
    const findings = scanText(text);
    expect(buildCleanText(text, findings)).toBe('line one\n[PRIVATE_KEY_1]\nline three');
  });

  it('wins overlaps with everything inside the block', () => {
    const text = `-----BEGIN PRIVATE KEY-----\napi_key=${SYNTHETIC_STRIPE_SHAPED_KEY}\n10.0.0.5\n-----END PRIVATE KEY-----`;
    const findings = scanText(text);
    expect(findings.map((f) => f.detectorId)).toEqual(['private-key']);
  });
});

describe('connection string detector', () => {
  it('finds credential-bearing URLs across schemes', () => {
    expect(
      values(connectionStringDetector, 'db at postgres://svc:demo-pw@db01.example.test:5432/app ok'),
    ).toEqual(['postgres://svc:demo-pw@db01.example.test:5432/app']);
    expect(
      values(connectionStringDetector, 'mongodb+srv://user:pw@cluster.example.test/db'),
    ).toEqual(['mongodb+srv://user:pw@cluster.example.test/db']);
  });

  it('finds ADO-style strings only when a password segment is present', () => {
    expect(
      values(
        connectionStringDetector,
        'cs = "Server=db01;Database=app;User Id=svc;Password=demo-pw-not-real;"',
      ),
    ).toEqual(['Server=db01;Database=app;User Id=svc;Password=demo-pw-not-real;']);
    expect(
      values(connectionStringDetector, 'Server=db01;Database=app;Integrated Security=true;'),
    ).toEqual([]);
  });

  it('ignores URLs without credentials', () => {
    expect(values(connectionStringDetector, 'https://example.com/x and redis://cache01:6379')).toEqual(
      [],
    );
  });

  it('never crosses line boundaries in ADO strings', () => {
    expect(
      values(connectionStringDetector, 'Server=db01;Database=app;\nPassword=demo-pw;'),
    ).toEqual([]);
  });

  it('beats the fragments it contains (password value, hostname, url)', () => {
    const text = 'Server=db01;User Id=svc;Password=demo-pw-not-real;';
    expect(scanText(text).map((f) => f.detectorId)).toEqual(['connection-string']);
    const url = 'postgres://svc:demo-pw@db01.example.internal/app';
    expect(scanText(url).map((f) => f.detectorId)).toEqual(['connection-string']);
  });
});

describe('payment card detector', () => {
  it('validates with length, issuer plausibility, and Luhn', () => {
    expect(luhnValid('4111111111111111')).toBe(true);
    expect(isLikelyCardNumber('4111 1111 1111 1111')).toBe(true);
    expect(isLikelyCardNumber('4111 1111 1111 1112')).toBe(false); // Luhn fails
    expect(isLikelyCardNumber('9111 1111 1111 1113')).toBe(false); // no issuer
    expect(isLikelyCardNumber('4111111111')).toBe(false); // too short
    expect(isLikelyCardNumber('4444444444444448')).toBe(false); // repeated digit
  });

  it('finds grouped and bare card numbers', () => {
    expect(values(paymentCardDetector, 'Card: 4111 1111 1111 1111 exp 01/30')).toEqual([
      '4111 1111 1111 1111',
    ]);
    expect(values(paymentCardDetector, 'pan=4111111111111111')).toEqual(['4111111111111111']);
    expect(values(paymentCardDetector, 'amex 3782 822463 10005 ok')).toEqual(['3782 822463 10005']);
  });

  it('ignores Luhn-failing runs, timestamps, and GUID fragments', () => {
    expect(values(paymentCardDetector, 'order 1234 5678 9012 3456 placed')).toEqual([]);
    expect(
      values(paymentCardDetector, 'TenantId: 11111111-2222-3333-4444-555555555555'),
    ).toEqual([]);
    expect(values(paymentCardDetector, 'epoch 1719849600000 and 4111111111111111000')).toEqual([]);
  });

  it('does not match inside longer digit runs', () => {
    expect(values(paymentCardDetector, 'serial 94111111111111111100 end')).toEqual([]);
  });
});

describe('phone detector (strict)', () => {
  it('finds labeled NANP numbers in common shapes', () => {
    expect(values(phoneDetector, 'Phone: (555) 123-4567')).toEqual(['(555) 123-4567']);
    expect(values(phoneDetector, 'Mobile = +1 555.123.4567 x89')).toEqual(['+1 555.123.4567 x89']);
    expect(values(phoneDetector, 'fax: 5551234567')).toEqual(['5551234567']);
  });

  it('requires the label — free-text numbers are ignored', () => {
    expect(values(phoneDetector, 'call me at (555) 123-4567 anytime')).toEqual([]);
  });

  it('ignores non-number values and never crosses lines', () => {
    expect(values(phoneDetector, 'Phone: unlisted')).toEqual([]);
    expect(values(phoneDetector, 'Phone:\n(555) 123-4567')).toEqual([]);
  });
});

describe('address detector (strict)', () => {
  it('finds labeled number-led street addresses', () => {
    expect(values(addressDetector, 'Address: 123 Demo Street, Exampleville')).toEqual([
      '123 Demo Street, Exampleville',
    ]);
    expect(values(addressDetector, 'HomeAddress = "45 Example Ave #2"')).toEqual([
      '45 Example Ave #2',
    ]);
  });

  it('requires a leading street number and the label', () => {
    expect(values(addressDetector, 'Address: unknown at this time')).toEqual([]);
    expect(values(addressDetector, 'meet at 123 Demo Street later')).toEqual([]);
  });

  it('never absorbs the next line', () => {
    const [m] = addressDetector.detect('Address: 123 Demo Street\nOwner: Alex Demo');
    expect(m.value).toBe('123 Demo Street');
  });

  it('does not fire on IPAddress fields', () => {
    expect(values(addressDetector, 'IPAddress: 10.0.0.5')).toEqual([]);
  });
});

describe('date of birth detector (strict)', () => {
  it('finds labeled dates in ISO, slashed, and written shapes', () => {
    expect(values(dobDetector, 'DOB: 1990-01-31')).toEqual(['1990-01-31']);
    expect(values(dobDetector, 'DateOfBirth = 1/31/1990')).toEqual(['1/31/1990']);
    expect(values(dobDetector, 'Birth Date: January 31, 1990')).toEqual(['January 31, 1990']);
  });

  it('requires the label — plain dates and timestamps are ignored', () => {
    expect(values(dobDetector, 'deployed 2026-07-01 09:42:11')).toEqual([]);
    expect(values(dobDetector, 'Updated: 2026-07-01')).toEqual([]);
  });

  it('rejects impossible ISO dates', () => {
    expect(values(dobDetector, 'DOB: 1990-13-40')).toEqual([]);
  });
});

describe('Canadian SIN detector (strict)', () => {
  it('checksums correctly', () => {
    expect(isValidSin('123 456 782')).toBe(true);
    expect(isValidSin('123 456 789')).toBe(false); // Luhn fails
    expect(isValidSin('046 454 286')).toBe(false); // leading 0 not issued
    expect(isValidSin('846 454 286')).toBe(false); // leading 8 not issued
  });

  it('finds labeled and conventionally grouped SINs', () => {
    expect(values(sinDetector, 'SIN: 123456782')).toEqual(['123456782']);
    expect(values(sinDetector, 'benefits for 123-456-782 filed')).toEqual(['123-456-782']);
  });

  it('never flags bare 9-digit runs without label or grouping', () => {
    expect(values(sinDetector, 'invoice 123456782 paid')).toEqual([]);
  });

  it('requires consistent separators and clean boundaries', () => {
    expect(values(sinDetector, 'ref 123-456 782 mixed')).toEqual([]);
    expect(values(sinDetector, 'run 9123-456-782 end')).toEqual([]);
  });

  it('keeps one finding when label and grouping overlap', () => {
    const findings = scanText('SIN: 123 456 782', { enabledDetectorIds: strictIds });
    expect(findings.filter((f) => f.detectorId === 'canadian-sin')).toHaveLength(1);
    expect(findings[0].confidence).toBe('high');
  });
});

describe('health identifier detector (strict)', () => {
  it('finds labeled identifiers with enough digits', () => {
    expect(values(healthIdDetector, 'MRN: 12-345678')).toEqual(['12-345678']);
    expect(values(healthIdDetector, 'HealthCard = 1234-567-890')).toEqual(['1234-567-890']);
    expect(values(healthIdDetector, 'PatientID: AB123456')).toEqual(['AB123456']);
  });

  it('ignores word values, short values, and unlabeled numbers', () => {
    expect(values(healthIdDetector, 'MRN: pending')).toEqual([]);
    expect(values(healthIdDetector, 'MRN: 12345')).toEqual([]); // too short
    expect(values(healthIdDetector, 'chart 12-345678 reviewed')).toEqual([]);
  });

  it('never crosses lines', () => {
    expect(values(healthIdDetector, 'MRN:\n12-345678')).toEqual([]);
  });
});

describe('profile wiring for new rules', () => {
  it('balanced includes key blocks, connection strings, and cards but no strict PII', () => {
    const text = [
      'Card: 4111 1111 1111 1111',
      'postgres://svc:demo-pw@db01.example.test/app',
      'Phone: (555) 123-4567',
      'SIN: 123 456 782',
    ].join('\n');
    const balanced = scanText(text);
    expect(balanced.map((f) => f.detectorId).sort()).toEqual(['connection-string', 'payment-card']);
    const strict = scanText(text, { enabledDetectorIds: strictIds });
    const strictFound = new Set(strict.map((f) => f.detectorId));
    expect(strictFound.has('phone-number')).toBe(true);
    expect(strictFound.has('canadian-sin')).toBe(true);
  });
});
