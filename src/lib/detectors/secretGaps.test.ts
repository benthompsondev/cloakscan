/**
 * Independent detection-gap regressions (v1.5.1 hardening pass).
 *
 * Each case here was written from the behavior docs/detectors.md promises —
 * "quoted and unquoted same-line literals in common assignment, JSON, YAML,
 * environment-file, CLI, and simple XML shapes" and "No partial redaction,
 * ever" — and then confirmed against the shipped v1.5.1 build before the fix.
 * Every value is synthetic.
 */
import { describe, expect, it } from 'vitest';
import { buildCleanText } from '../sanitize';
import { scanText } from '../scan';
import { SYNTHETIC_AWS_ACCESS_KEY_ID, SYNTHETIC_GITHUB_TOKEN } from '../synthetic';
import type { Detector } from '../types';
import { secretAssignmentDetector } from './secrets';

const values = (text: string) => secretAssignmentDetector.detect(text).map((m) => m.value);
const clean = (text: string) => buildCleanText(text, scanText(text));

describe('literal dollar signs are not always interpolation', () => {
  it.each([
    ['JSON double-quoted', '{"password":"pa$$word"}', ['pa$$word']],
    ['JSON compound key', '{"db_password":"my$ecret"}', ['my$ecret']],
    ['JSON repeated dollars', '{"client_secret":"a$b$c$d$e"}', ['a$b$c$d$e']],
    ['YAML key at line start', 'password: "S3cure$Pass"', ['S3cure$Pass']],
    ['YAML plain scalar', '  api_key: my$ecretvalue', ['my$ecretvalue']],
    ['env file with doubled dollars', 'PASSWORD=pa$$word', ['pa$$word']],
    ['crypt-format hash', 'passwordHash=$2y$10$abcdefghijklmnop', ['$2y$10$abcdefghijklmnop']],
    ['sha-crypt hash', 'PASSWORD=$5$rounds$abcdefgh', ['$5$rounds$abcdefgh']],
  ])('treats a dollar sign as part of the literal in %s', (_name, source, expected) => {
    expect(values(source)).toEqual(expected);
  });

  it.each([
    // Genuine variable references and interpolations must still be left alone.
    '$Password = "prefix-$user"',
    '$Password = $env:PASSWORD',
    'password = $storedCred',
    'password="a${b}c"',
    'password=$(Get-Secret)',
    'password=%USERPASSWORD%',
    'Write-Host "password: prefix-$pw"',
  ])('still leaves a variable reference unchanged: %s', (source) => {
    expect(values(source)).toEqual([]);
  });
});

describe('credential field names where the keyword is not the last word', () => {
  it.each([
    ['AWS secret access key', 'aws_secret_access_key=wJalrDEMOnotarealkey0000000000000000', true],
    ['PascalCase AWS key', 'SecretAccessKey=wJalrDEMOnotarealkey0000000000000000', true],
    ['quoted secret access key', 'secret_access_key: "wJalrDEMOnotareal000"', true],
    ['Azure shared access key', 'SharedAccessKey=abcdefgh12345678', true],
    ['generic secret key', 'SecretKey=abc123def456', true],
    ['private key field', 'private_key=abc123def456', true],
    ['signing key', 'signing_key=abc123def456', true],
    ['encryption key', 'encryption_key=abc123def456', true],
    ['secret value suffix', 'ClientSecretValue=abc123def456', true],
    ['token value suffix', 'TokenValue=abc123def456', true],
    ['secret string suffix', 'SecretString=abc123def456', true],
    ['numbered secret', 'secret2=abc123def456', true],
  ])('detects %s', (_name, source, expected) => {
    expect(values(source).length > 0).toBe(expected);
  });

  it.each([
    // Metadata about a credential is not the credential.
    'password_length=16',
    'PASSWORD_FILE=/etc/secrets/db',
    'api_key_name=production',
    'password_command=Generate-Password',
    'token_endpoint=https://login.example.test/oauth2/token',
    'public_key=abc123def456',
    'private_key_path=/etc/ssl/demo.pem',
    // "authorization" is an ordinary word in support text; see CORE_SECRET_WORDS.
    'authorization: pending review',
    'The authorization: granted by manager',
  ])('does not treat credential metadata as a credential: %s', (source) => {
    expect(values(source)).toEqual([]);
  });
});

describe('"pass" inside an ordinary English word is not a credential field', () => {
  it.each([
    'compass=north',
    'encompass=all',
    'surpass=100',
    'lowpass=200',
    'bypass=/etc/hosts',
    'compassHash = "sha256-demo"',
    'BYPASS_VALUE = "manual"',
  ])('ignores %s', (source) => {
    expect(values(source)).toEqual([]);
  });

  it.each([
    ['separator before pass', 'ftp_pass=hunter2', ['hunter2']],
    ['dotted passwd', 'db.passwd=hunter2', ['hunter2']],
    ['bare pass', 'pass=hunter2', ['hunter2']],
    ['dashed pwd', 'db-pwd=hunter2', ['hunter2']],
    // Fused but not English words: an earlier structural rule dropped these.
    ['fused userpass', 'userpass = "hunter2"', ['hunter2']],
    ['fused dbpass', 'dbpass=hunter2', ['hunter2']],
    ['camel case', 'SmtpUserPass = "hunter2"', ['hunter2']],
  ])('still detects %s', (_name, source, expected) => {
    expect(values(source)).toEqual(expected);
  });
});

describe('a colon separator only means JSON/YAML where it really is one', () => {
  it.each([
    ['quoted JSON key', '{"password":"pa$$word"}', ['pa$$word']],
    ['YAML key opening the line', 'password: "S3cure$Pass"', ['S3cure$Pass']],
    ['indented YAML key', '  api_key: my$ecretvalue', ['my$ecretvalue']],
    ['YAML list item', '- password: my$ecret', ['my$ecret']],
  ])('reads %s as data', (_name, source, expected) => {
    expect(values(source)).toEqual(expected);
  });

  it.each([
    // A shell or PowerShell command line is not YAML; the value interpolates.
    'echo password: prefix-$PASSWORD',
    'Write-Host password: prefix-$pw',
  ])('does not read a mid-line colon as a YAML key: %s', (source) => {
    expect(values(source)).toEqual([]);
  });
});

describe('shell positional and special parameters are references, not literals', () => {
  it.each(['password="$1"', 'password=$1', 'password="$@"', 'password=$*'])(
    'leaves %s unchanged',
    (source) => {
      expect(values(source)).toEqual([]);
    },
  );

  it('still detects a crypt hash that opens with a dollar and a digit', () => {
    expect(values('passwordHash=$2y$10$abcdefgh')).toEqual(['$2y$10$abcdefgh']);
  });
});

describe('subscript and arrow assignment idioms', () => {
  it.each([
    ['bracket subscript', 'cfg["password"] = "hunter2"', '"hunter2"'],
    ['single-quoted subscript', "cfg['password'] = 'hunter2'", "'hunter2'"],
    ['PHP-style subscript', "$config['password'] = 'hunter2';", "'hunter2'"],
    ['python environ', 'os.environ["API_KEY"] = "abc123def456"', '"abc123def456"'],
    ['fat arrow', 'password => "hunter2"', '"hunter2"'],
  ])('redacts the literal in %s without eating the syntax', (_name, source, quoted) => {
    const out = clean(source);
    expect(out).toBe(source.replace(quoted, quoted[0] + '[SECRET_1]' + quoted[0]));
  });
});

describe('an unquoted value never escapes its enclosing string literal', () => {
  it('keeps a PowerShell -replace replacement string syntactically intact', () => {
    const source = String.raw`$text -replace 'password=\w+', 'password=hunter2'`;

    expect(clean(source)).toBe(String.raw`$text -replace 'password=\w+', 'password=[SECRET_1]'`);
  });

  it('does not swallow the closing quote of a placeholder replacement', () => {
    const source = String.raw`$text -replace 'password=\w+', 'password=redacted'`;

    expect(clean(source)).toBe(source);
  });

  it('stops at the closing quote inside a double-quoted command', () => {
    const source = 'Write-Output "password=hunter2" | Out-File log.txt';

    expect(clean(source)).toBe('Write-Output "password=[SECRET_1]" | Out-File log.txt');
  });

  it.each([
    ["apostrophe in prose before the value", "it's password=ab'cd", "it's password=[SECRET_1]"],
    [
      'apostrophe on both sides',
      "it's password=abc123 and Bob's key",
      "it's password=[SECRET_1]",
    ],
    ['apostrophe with no later quote', "don't paste password=hunter2", "don't paste [SECRET_1]"],
    ['quotes inside an unquoted value', 'password=say"what"now', 'password=[SECRET_1]'],
    ['apostrophe inside the value', "PASSWORD=O'Brien2024", 'PASSWORD=[SECRET_1]'],
  ])('does not treat an apostrophe in prose as a delimiter: %s', (_name, source, expected) => {
    // Cutting at a prose apostrophe would leave the rest of the value visible
    // in output the user has been told is sanitized.
    const out = clean(source);
    expect(out).not.toMatch(/cd$|what|Brien/);
    if (expected.includes('[SECRET_1]')) expect(out).toContain('[SECRET_1]');
  });
});

describe('no partial redaction when a provider key sits inside a wider secret', () => {
  it.each([
    ['trailing suffix after a provider prefix', 'api_key=sk-abcdefghij1234567890-EXTRA'],
    ['dotted suffix after a GitHub token', `token=${SYNTHETIC_GITHUB_TOKEN}.extra`],
    ['prose after a provider key', `Password=hunter2 and ${SYNTHETIC_AWS_ACCESS_KEY_ID} is the key`],
  ])('leaves no fragment of the credential visible: %s', (_name, source) => {
    const out = clean(source);
    const value = source.slice(source.indexOf('=') + 1);
    for (const fragment of value.split(/[^A-Za-z0-9]+/)) {
      if (fragment.length >= 4) expect(out, `fragment "${fragment}" survived`).not.toContain(fragment);
    }
  });
});

describe('a double quote always closes the string it opened', () => {
  it.each([
    ['member access', 'const value = "password=hunter2".trim();', 'const value = "[SECRET_1]".trim();'],
    ['comma', 'const v = "password=hunter2", x = 1;', 'const v = "[SECRET_1]", x = 1;'],
    ['pipe', 'Write-Output "password=hunter2" | Out-File log.txt', 'Write-Output "[SECRET_1]" | Out-File log.txt'],
  ])('keeps the code valid after the closing quote: %s', (_name, source, expected) => {
    // Requiring punctuation after a closing double quote ate ".trim();".
    expect(clean(source)).toBe(expected.replace('"[SECRET_1]"', '"password=[SECRET_1]"'));
  });
});

describe('a quoted key only means structured data where a key can sit', () => {
  it.each([
    ['object open', '{"password":"pa$$word"}', ['pa$$word']],
    ['after a comma', '{ "a":"b", "password":"my$ecret" }', ['my$ecret']],
  ])('treats %s as JSON', (_name, source, expected) => {
    expect(values(source)).toEqual(expected);
  });

  it('does not read a quoted word mid-command as a JSON key', () => {
    expect(values('echo "password": prefix-$PASSWORD')).toEqual([]);
  });
});

describe('overlapping containers cannot leave an uncovered head or tail', () => {
  it.each([
    ['contained match wins', 10, 11, 99],
    ['first container wins', 99, 11, 10],
    ['second container wins', 10, 99, 11],
  ])('covers the whole overlapping run when the %s', (_name, pa, pb, pn) => {
    const text = 'A'.repeat(120);
    const span = (id: string, priority: number, start: number, end: number): Detector => ({
      id,
      name: id,
      category: 'secrets',
      severity: 'high',
      label: 'SECRET',
      priority,
      explanation: id,
      detect: (t) => [{ start, end, value: t.slice(start, end), confidence: 'high' }],
    });

    const findings = scanText(text, {
      enabledDetectorIds: [],
      extraDetectors: [span('wide-a', pa, 0, 105), span('wide-b', pb, 10, 110), span('narrow', pn, 50, 60)],
    });

    // [0,110) is one overlapping run; only the 10 characters past it survive,
    // whichever member wins on priority.
    expect(buildCleanText(text, findings)).toBe('[SECRET_1]' + 'A'.repeat(10));
  });

  it('grows a contained match to the union of everything containing it', () => {
    // Two secrets candidates that overlap without either containing the other,
    // plus a higher-priority one inside both. Growing only to the furthest
    // reach ([10,110]) lets [0,105] be discarded and leaves [0,10) visible.
    const text = 'A'.repeat(120);
    const span = (id: string, priority: number, start: number, end: number): Detector => ({
      id,
      name: id,
      category: 'secrets',
      severity: 'high',
      label: 'SECRET',
      priority,
      explanation: id,
      detect: (t) => [{ start, end, value: t.slice(start, end), confidence: 'high' }],
    });

    const findings = scanText(text, {
      enabledDetectorIds: [],
      extraDetectors: [span('wide-a', 10, 0, 105), span('wide-b', 11, 10, 110), span('narrow', 99, 50, 60)],
    });
    const out = buildCleanText(text, findings);

    // [0,110] is covered as one placeholder; only the 10 characters past the
    // last candidate survive. A visible head would show up as leading text.
    expect(out).toBe('[SECRET_1]' + 'A'.repeat(10));
    expect(out.startsWith('[SECRET_1]')).toBe(true);
  });
});

describe('a value longer than the terminator window keeps its boundary', () => {
  it('does not swallow the next field past the search window', () => {
    const secret = 'secret' + 'x'.repeat(4100);
    const source = `password=${secret} next=value`;

    expect(values(source)).toEqual([secret]);
    expect(clean(source)).toBe('password=[SECRET_1] next=value');
  });
});

describe('overlap resolution stays workable at the advertised import size', () => {
  it('scans a dense 2 MB input without quadratic blow-up', () => {
    const line =
      'user=admin password=hunter2 api_key=sk-abcdefghij1234567890 host=db.example.internal\n';
    const text = line.repeat(Math.ceil((2 * 1024 * 1024) / line.length));
    const started = performance.now();
    const findings = scanText(text);
    const elapsed = performance.now() - started;

    expect(findings.length).toBeGreaterThan(10_000);
    // v1.5.1 took ~27s here on the reference machine, entirely in overlap
    // resolution. The bound is loose so slower CI hardware does not flake.
    expect(elapsed).toBeLessThan(10_000);
  }, 60_000);
});

describe('a PowerShell type cast does not hide the literal behind it', () => {
  it('redacts the cast string literal and keeps the cast', () => {
    expect(clean('$Password = [string] "hunter2"')).toBe('$Password = [string] "[SECRET_1]"');
  });

  it('still leaves a cast over a non-literal expression alone', () => {
    expect(values("password = [char[]]('a','b')")).toEqual([]);
  });
});
