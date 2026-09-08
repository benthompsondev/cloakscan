/** Deterministic mutations of synthetic data. No production samples or fuzzing service. */
export interface MutationCase {
  name: string;
  source: string;
  secret: string;
}

const fields = [
  ['password', 'Falcon!47-SecretTail'],
  ['api_key', 'Falcon!47-KeyTail'],
  ['MRN', 'ZX-12345678-99887766'],
  ['Patient_ID', 'AB12345678'],
  ['DOB', '1988-03-19'],
  ['Phone', '416-555-0123'],
] as const;
const spaces = ['', ' ', '\t', '\u00a0', '\u2009'];
const casings = [(s: string) => s, (s: string) => s.toUpperCase(), (s: string) => s.toLowerCase()];
const envelopes = [
  (key: string, ws: string, value: string) => `${key}${ws}:${ws}${value}`,
  (key: string, ws: string, value: string) => `${key}${ws}=${ws}'${value}'`,
  (key: string, ws: string, value: string) => `{"outer":{"${key}"${ws}:${ws}"${value}"},"status":"ok"}`,
  (key: string, ws: string, value: string) => `root:\n  ${key}${ws}:${ws}"${value}"\nstatus: ok`,
];

export const fieldMutations: MutationCase[] = fields.flatMap(([key, secret]) =>
  casings.flatMap((changeCase, ci) => spaces.flatMap((ws, wi) => envelopes.map((wrap, ei) => ({
    name: `${key}/case${ci}/space${wi}/syntax${ei}`,
    source: wrap(changeCase(key), ws, secret), secret,
  })))),
);

const token = `ghp_${'Q7'.repeat(18)}`;
export const boundaryMutations: MutationCase[] = [
  ...['\n', '\r\n'].flatMap((nl) => [
    { name: `here string ${JSON.stringify(nl)}`, source: `$password = @'${nl}Falcon!47${nl}SecretTail${nl}'@`, secret: `Falcon!47${nl}SecretTail` },
    { name: `YAML block ${JSON.stringify(nl)}`, source: `password: |- # synthetic${nl}  Falcon!47${nl}  SecretTail${nl}status: ok`, secret: `Falcon!47${nl}  SecretTail` },
  ]),
  ...[' ', '\t', '\u00a0', '\u2009'].map((ws, i) => ({ name: `auth whitespace ${i}`, source: `Authorization:${ws}bEaReR${ws}${token}`, secret: token })),
  ...['"', "'", '“'].map((quote, i) => ({ name: `credential quote ${i}`, source: `password: ${quote}Falcon!47 SecretTail${quote === '“' ? '”' : quote}`, secret: 'Falcon!47 SecretTail' })),
  { name: 'escaped apostrophe in shell', source: String.raw`password='Falcon!47'\''SecretTail'`, secret: String.raw`Falcon!47'\''SecretTail` },
  { name: 'PowerShell doubled quote', source: "$password = 'Falcon!47''SecretTail'", secret: "Falcon!47''SecretTail" },
  { name: 'JSON escaped quote', source: String.raw`{"password":"Falcon!47\"SecretTail"}`, secret: String.raw`Falcon!47\"SecretTail` },
  { name: 'JSON escaped key', source: String.raw`{"pass\u0077ord":"Falcon!47-SecretTail"}`, secret: 'Falcon!47-SecretTail' },
  { name: 'Unicode value', source: 'password: "Fälcon🔒47-秘密-tail"', secret: 'Fälcon🔒47-秘密-tail' },
  { name: 'Unicode prefix', source: `🔒=${token}`, secret: token },
  { name: 'Unicode fullwidth label', source: 'ＰＡＳＳＷＯＲＤ: Falcon!47-SecretTail', secret: 'Falcon!47-SecretTail' },
  { name: 'internal URL with closing parenthesis', source: 'https://vault.internal/private/(patient)/AB123456', secret: 'https://vault.internal/private/(patient)/AB123456' },
  { name: 'JSON escaped internal URL', source: String.raw`{"url":"https:\/\/vault.internal\/patient\/AB123456"}`, secret: String.raw`https:\/\/vault.internal\/patient\/AB123456` },
  { name: 'overlapping URL and token', source: `https://vault.internal/private?token=${token}`, secret: `https://vault.internal/private?token=${token}` },
  { name: 'adjacent secrets', source: `password="Falcon!47-SecretTail"; token="${token}"`, secret: 'Falcon!47-SecretTail' },
  { name: 'provider in wrapper', source: `const headers = {'Authorization': 'Bearer ${token}'};`, secret: token },
  { name: 'path with Unicode', source: '"C:\\Users\\MiraDemo\\Private🔒\\record.txt"', secret: 'C:\\Users\\MiraDemo\\Private🔒\\record.txt' },
  { name: 'quoted patient name', source: '{"patient_name":"Mira Example"}', secret: 'Mira Example' },
  { name: 'MRN significant suffix', source: 'MRN: 12345678-AB-99887766', secret: '12345678-AB-99887766' },
];

export const benignMutations = [
  ...spaces.flatMap((ws) => [
    `password_length${ws}=${ws}24`, `token_endpoint${ws}=${ws}https://example.com/oauth`,
    `MRN${ws}:${ws}pending`, `Phone${ws}:${ws}unavailable`,
  ]),
  '$password = Get-Secret -Name Demo', 'password="$VAULT_PASSWORD"',
  'apiKey: process.env.API_KEY', String.raw`$text -replace 'password=\w+', 'password=redacted'`,
  'const jsonExample = "https:\\/\\/example.com/docs";',
  'MRN validation uses a checksum.', 'The patient was seen for follow-up.',
];
