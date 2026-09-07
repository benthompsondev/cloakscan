import { SYNTHETIC_PROVIDER_TOKENS } from '../lib/synthetic';

/** Synthetic only. Sentinels are deliberately unrelated to any live account or patient. */
export interface PrivacyCase {
  name: string;
  source: string;
  hidden: string[];
  kept?: string[];
}

const github = `ghp_${'Q7'.repeat(18)}`;
const signature = 'a7'.repeat(32);

export const privacyCases: PrivacyCase[] = [
  ...Object.entries(SYNTHETIC_PROVIDER_TOKENS).map(([name, source]) => ({
    name: `provider ${name}`, source, hidden: [source],
  })),
  ...[
    'password=Falcon!47', 'password: Falcon!47', '{"password":"Falcon!47"}',
    'export DB_PASSWORD=Falcon!47', "$password = 'Falcon!47'",
    'tool --password Falcon!47 --verbose', '<password>Falcon!47</password>',
    'api-key = "Falcon!47"', 'PASSphrase:\tFalcon!47',
    'aws_secret_access_key=Falcon!47', 'PFX_PASSWORD=Falcon!47',
  ].map((source, i) => ({ name: `assignment format ${i}`, source, hidden: ['Falcon!47'] })),
  { name: 'escaped JSON quote', source: String.raw`{"password":"Falcon\"!47-tail"}`, hidden: ['Falcon', '!47-tail'] },
  { name: 'literal dollar in JSON', source: '{"password":"${Falcon!47}"}', hidden: ['Falcon!47'] },
  { name: 'pretty JSON literal dollar', source: '{\n  "password": "${Falcon!47}"\n}', hidden: ['Falcon!47'] },
  { name: 'long CLI value', source: `tool --password ${'z'.repeat(4200)}secret-tail --verbose`, hidden: ['secret-tail'], kept: [' --verbose'] },
  { name: 'provider punctuation tail', source: `glpat-${'x'.repeat(25)}_-`, hidden: ['x'.repeat(25), '_-'] },
  { name: 'YAML folded block', source: 'passphrase: >-\n  Falcon!47\n  second-secret-line\nstatus: active', hidden: ['Falcon!47', 'second-secret-line'], kept: ['status: active'] },
  { name: 'YAML block comment', source: 'password: | # deployment credential\n  Falcon!47\n  second-secret-line\nstatus: active', hidden: ['Falcon!47', 'second-secret-line'], kept: ['status: active'] },
  { name: 'multiline quoted YAML', source: 'password: "Falcon!47\n  second-secret-line"\nstatus: active', hidden: ['Falcon!47', 'second-secret-line'], kept: ['status: active'] },
  { name: 'PowerShell here string', source: '$password = @"\nFalcon!47\nsecond-secret-line\n"@\nWrite-Output "done"', hidden: ['Falcon!47', 'second-secret-line'], kept: ['Write-Output "done"'] },
  { name: 'Python triple quote', source: 'password = """Falcon!47\nsecond-secret-line"""\nprint("done")', hidden: ['Falcon!47', 'second-secret-line'], kept: ['print("done")'] },
  { name: 'multiline XML', source: '<password>\nFalcon!47\nsecond-secret-line\n</password>', hidden: ['Falcon!47', 'second-secret-line'] },
  { name: 'bearer mixed case', source: 'Authorization: bEaReR Falcon47.token-_/+=', hidden: ['Falcon47.token-_/+='] },
  { name: 'JSON Basic header', source: '{"Authorization":"Basic RGVtbzpGYWxjb24hNDc="}', hidden: ['RGVtbzpGYWxjb24hNDc='] },
  { name: 'short Basic credential', source: 'Authorization: Basic YTpi', hidden: ['YTpi'] },
  { name: 'short bearer credential', source: 'Authorization: Bearer abc123', hidden: ['abc123'] },
  { name: 'GitHub token', source: github, hidden: [github] },
  { name: 'GitHub fine grained', source: `github_pat_${'X8'.repeat(35)}`, hidden: ['X8'.repeat(35)] },
  { name: 'AWS access ID', source: 'AKIAZ7Y6X5W4V3U2T1S0', hidden: ['AKIAZ7Y6X5W4V3U2T1S0'] },
  { name: 'provider tail overlap', source: `password=${github}!private-tail`, hidden: [github, '!private-tail'] },
  { name: 'credential URL', source: 'postgresql://demo:Falcon!47@db.example.net/private_db', hidden: ['demo', 'Falcon!47', 'private_db'] },
  { name: 'ADO quoted password', source: 'Server=db01;Database=case_db;Password="Falcon!47;tail";', hidden: ['Falcon!47', 'tail'] },
  { name: 'private key', source: '-----BEGIN PRIVATE KEY-----\nU3ludGhldGljS2V5T25seQ==\n-----END PRIVATE KEY-----', hidden: ['U3ludGhldGljS2V5T25seQ=='] },
  { name: 'OpenSSH private key', source: '-----BEGIN OPENSSH PRIVATE KEY-----\nU3ludGhldGljS2V5T25seQ==\n-----END OPENSSH PRIVATE KEY-----', hidden: ['U3ludGhldGljS2V5T25seQ=='] },
  { name: 'internal URL containing credential', source: `https://vault.internal/confidential/merger?token=${github}`, hidden: ['vault.internal', 'confidential/merger', github] },
  { name: 'internal URL containing signature', source: `https://files.internal/private-path?X-Amz-Signature=${signature}`, hidden: ['files.internal', 'private-path', signature] },
  { name: 'private key containing regex syntax', source: "-----BEGIN PRIVATE KEY-----\nFalcon!47\n-match 'AB-12345'\n-----END PRIVATE KEY-----", hidden: ['Falcon!47', 'AB-12345'] },
  { name: 'credential used as regex literal', source: `$text -match '${github}'`, hidden: [github] },
  ...[
    'MRN: 12-345678', '{"mrn":"AB-12345678"}', 'medical_record_number = AB-12345678',
    'Patient_ID: AB-12345678', 'NHS Number: 943 476 5919', 'OHIP: 1234-567-890-AB',
    'Health Card Number: 1234 567 890 AB', 'MRN: 12345678-98765432',
    'patient_id: 550e8400-e29b-41d4-a716-446655440000',
  ].map((source, i) => ({ name: `health identifier ${i}`, source, hidden: [source.includes('550e') ? '446655440000' : (source.match(/(?:AB-)?\d[\d -]+(?:AB)?/)?.[0] ?? '')] })),
  { name: 'health identifier tail', source: 'MRN: 12345678-98765432', hidden: ['12345678', '98765432'] },
  { name: 'patient name', source: 'Patient Name: Mira Example', hidden: ['Mira Example'] },
  { name: 'JSON DOB', source: '{"dob":"1988-03-19"}', hidden: ['1988-03-19'] },
  { name: 'JSON phone', source: '{"phone":"416-555-0123"}', hidden: ['416-555-0123'] },
  { name: 'JSON address', source: '{"address":"123 Demo Road, Exampleville"}', hidden: ['123 Demo Road', 'Exampleville'] },
  { name: 'long address', source: `Address: 123 ${'Demo Road '.repeat(9)}Privateville`, hidden: ['Privateville', 'Demo Road'] },
  { name: 'health prose boundary', source: 'MRN: 12345678 is valid', hidden: ['12345678'], kept: [' is valid'] },
  { name: 'email', source: 'mira@example.net', hidden: ['mira@example.net'] },
  { name: 'SSN', source: 'SSN: 123-45-6789', hidden: ['123-45-6789'] },
  { name: 'SIN', source: 'SIN: 123 456 782', hidden: ['123 456 782'] },
  { name: 'card', source: '4111 1111 1111 1111', hidden: ['4111 1111 1111 1111'] },
  { name: 'internal hostname', source: 'db01.ad.example.com', hidden: ['db01.ad.example.com'] },
  { name: 'internal URL', source: 'https://portal.internal/patient/AB123456', hidden: ['portal.internal', 'AB123456'] },
  { name: 'UNC path', source: String.raw`\\files01\confidential\merger.txt`, hidden: ['files01', 'merger.txt'] },
  { name: 'Windows path', source: String.raw`C:\Users\DemoPerson\Documents\private.txt`, hidden: ['DemoPerson', 'private.txt'] },
  { name: 'Unix path', source: '/home/demo_user/private/incident.log', hidden: ['demo_user', 'incident.log'] },
  { name: 'private IP', source: '10.73.41.9', hidden: ['10.73.41.9'] },
  { name: 'tenant ID', source: 'TenantId: 550e8400-e29b-41d4-a716-446655440000', hidden: ['550e8400-e29b-41d4-a716-446655440000'] },
];

export const benignCases = [
  'The password is required to be 12 characters long.',
  'password_length = 24', 'token_endpoint=https://example.com/oauth',
  'authorization: pending review', 'type Options = { apiKey: string; }',
  'const token = process.env.ACCESS_TOKEN;', '$password = Get-Secret -Name Demo',
  'MRN: pending', 'patient_id: string', 'NHS number validation succeeded',
  'Version: 1.2.3.4', 'https://learn.microsoft.com/powershell/',
  String.raw`$text -match '[A-Z]{2}-\d{5}'`,
  '-----BEGIN CERTIFICATE-----\nUHVibGljQ2VydGlmaWNhdGU=\n-----END CERTIFICATE-----',
];
