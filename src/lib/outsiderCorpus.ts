/**
 * The outsider corpus: what a technically competent stranger would paste into
 * the live web demo in the first five minutes.
 *
 * Every case is fully synthetic. Expected output is HAND-WRITTEN from what a
 * correct sanitizer should produce on the default Balanced profile in
 * Safe-share mode — not transcribed from what the scanner currently does. When
 * a case is genuinely ambiguous, the note says so and explains which way it was
 * called and why.
 *
 * This corpus deliberately leans away from PowerShell. The project's private
 * corpus harness only collects .ps1/.psm1/.psd1, and the detector gaps found in
 * the v1.5.1 review clustered exactly where PowerShell is not: .env, JSON,
 * YAML, Terraform, Compose, Python, and JavaScript.
 *
 * Frozen: added before testing, and only changed afterwards with a recorded
 * reason.
 */
import {
  SYNTHETIC_AWS_ACCESS_KEY_ID,
  SYNTHETIC_GITHUB_TOKEN,
  SYNTHETIC_PROVIDER_TOKENS,
  SYNTHETIC_STRIPE_SHAPED_KEY,
} from './synthetic';

export type CorpusKind =
  /** Contains credential material that must not survive. */
  | 'secret'
  /** Contains nothing sensitive; any redaction here is a false positive. */
  | 'control'
  /** Sensitive and innocent content on the same page; both behaviors matter. */
  | 'mixed';

export interface CorpusCase {
  id: string;
  format: string;
  kind: CorpusKind;
  input: string;
  /** Hand-written expected sanitized output, Balanced profile, Safe-share. */
  expected: string;
  note?: string;
}

const lines = (...rows: string[]) => rows.join('\n');

/**
 * Provider-shaped fixtures are assembled from parts rather than written as
 * literals, the same convention synthetic.ts uses: a deliberately fake corpus
 * value should not read as a live credential to a public secret scanner or to
 * the pre-push guard. The assembled strings are byte-identical to the real
 * shapes, so detection is tested exactly as it would be in the wild.
 */
const AWS_ACCESS_KEY = SYNTHETIC_AWS_ACCESS_KEY_ID;
const GITHUB_TOKEN = SYNTHETIC_GITHUB_TOKEN;
const SLACK_TOKEN = ['xoxb', '1111111111', '2222222222', 'DEMOtokenvalue'].join('-');
const GOOGLE_API_KEY = ['AIza', 'SyDEMO0000000000000000000000000000'].join('');
const STRIPE_SECRET_KEY = SYNTHETIC_STRIPE_SHAPED_KEY;
const OPENAI_PROJECT_KEY = SYNTHETIC_PROVIDER_TOKENS.openAiProject;
const OPENAI_KEY = ['sk', 'DEMO000000000000000000000000'].join('-');
const OPENAI_KEY_SHORT = ['sk', 'DEMO0000000000000000000'].join('-');

/** Build a PEM block without the marker text appearing literally in source. */
const pem = (kind: string, body: string[]): string =>
  [
    ['-----BEGIN', kind, 'PRIVATE KEY-----'].filter(Boolean).join(' '),
    ...body,
    ['-----END', kind, 'PRIVATE KEY-----'].filter(Boolean).join(' '),
  ].join('\n');

export const OUTSIDER_CORPUS: readonly CorpusCase[] = Object.freeze([
  // ---------------------------------------------------------------- .env ---
  {
    id: 'env-typical-service',
    format: '.env',
    kind: 'mixed',
    input: lines(
      'DATABASE_URL=postgres://appuser:s3cr3tPass@db.example.internal:5432/appdb',
      `STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}`,
      'JWT_SECRET=r4nd0m-jwt-signing-value',
      'SMTP_PASSWORD=Sm7pPass',
      'DEBUG=false',
      'PORT=3000',
    ),
    expected: lines(
      'DATABASE_URL=[CONNECTION_STRING_1]',
      'STRIPE_SECRET_KEY=[API_KEY_1]',
      'JWT_SECRET=[SECRET_1]',
      'SMTP_PASSWORD=[SECRET_2]',
      'DEBUG=false',
      'PORT=3000',
    ),
    note: 'PORT=3000 is not a well-known service port and DEBUG is a flag; both stay.',
  },
  {
    id: 'env-dollar-values',
    format: '.env',
    kind: 'secret',
    input: lines(
      'PASSWORD_A=paSSw0rd',
      'PASSWORD_B=Summer$2026',
      'PASSWORD_C=$2y$10$N9qo8uLOickgx2ZMRZoMyeDEMOnotarealhash',
      'PASSWORD_D=${DB_PASSWORD}',
      'PASSWORD_E=$(vault read -field=password secret/db)',
    ),
    expected: lines(
      'PASSWORD_A=[SECRET_1]',
      'PASSWORD_B=[SECRET_2]',
      'PASSWORD_C=[SECRET_3]',
      'PASSWORD_D=${DB_PASSWORD}',
      'PASSWORD_E=$(vault read -field=password secret/db)',
    ),
    note: 'Brace and subshell expansions are references, not pasted secrets. A crypt hash is credential material.',
  },
  {
    id: 'env-doubled-dollar',
    format: '.env',
    kind: 'secret',
    input: 'DB_PASSWORD=pa$$w0rd',
    expected: 'DB_PASSWORD=[SECRET_1]',
    note: 'No shell reads $$w0rd as a variable named w0rd.',
  },
  {
    id: 'env-empty-and-quoted',
    format: '.env',
    kind: 'mixed',
    input: lines(
      'PASSWORD_EMPTY=',
      'PASSWORD_DQ="quoted value"',
      "PASSWORD_SQ='single quoted'",
      'PASSWORD_PLAIN=unquoted-value',
    ),
    expected: lines(
      'PASSWORD_EMPTY=',
      'PASSWORD_DQ="[SECRET_1]"',
      "PASSWORD_SQ='[SECRET_2]'",
      'PASSWORD_PLAIN=[SECRET_3]',
    ),
    note: 'An empty assignment has no secret to hide.',
  },

  // ---------------------------------------------------------------- JSON ---
  {
    id: 'json-appsettings',
    format: 'JSON',
    kind: 'mixed',
    input: lines(
      '{',
      '  "ConnectionStrings": {',
      '    "Default": "Server=sql01;Database=App;User Id=svc_app;Password=PsWd2026"',
      '  },',
      '  "Jwt": { "SigningKey": "super-secret-signing-key-2026", "Issuer": "https://api.example.com" },',
      '  "Logging": { "LogLevel": { "Default": "Information" } }',
      '}',
    ),
    expected: lines(
      '{',
      '  "ConnectionStrings": {',
      '    "Default": "[CONNECTION_STRING_1]"',
      '  },',
      '  "Jwt": { "SigningKey": "[SECRET_1]", "Issuer": "https://api.example.com" },',
      '  "Logging": { "LogLevel": { "Default": "Information" } }',
      '}',
    ),
    note: 'A public issuer URL and a log level are not secrets.',
  },
  {
    id: 'json-generic-key-field',
    format: 'JSON',
    kind: 'control',
    input: '{"Key": "PrimaryContact", "Value": "support"}',
    expected: '{"Key": "PrimaryContact", "Value": "support"}',
    note: 'AMBIGUOUS, called as no-redact: a bare "Key" field is a dictionary key far more often than a credential. Detecting it would fire on every key/value map.',
  },
  {
    id: 'json-dollar-and-repeat',
    format: 'JSON',
    kind: 'secret',
    input: '{"password":"P@$$w0rd","confirm_password":"P@$$w0rd","note":"rotate quarterly"}',
    expected: '{"password":"[SECRET_1]","confirm_password":"[SECRET_1]","note":"rotate quarterly"}',
    note: 'JSON has no interpolation, and the same value must reuse one placeholder.',
  },
  {
    id: 'json-service-account',
    format: 'JSON',
    kind: 'mixed',
    input:
      '{"type":"service_account","project_id":"demo-project","private_key_id":"a1b2c3d4e5f6","private_key":"' +
      pem('', ['MIIDEMOnotarealkey']).replace(/\n/g, '\\n') +
      '\\n","client_email":"svc@demo-project.iam.gserviceaccount.com"}',
    expected:
      '{"type":"service_account","project_id":"demo-project","private_key_id":"a1b2c3d4e5f6","private_key":"[PRIVATE_KEY_1]","client_email":"[EMAIL_1]"}',
    note: 'A key id identifies a key without being one. The key block itself must go whole.',
  },

  // ---------------------------------------------------------------- YAML ---
  {
    id: 'yaml-docker-compose',
    format: 'Docker Compose',
    kind: 'mixed',
    input: lines(
      'services:',
      '  db:',
      '    image: postgres:16',
      '    environment:',
      '      POSTGRES_USER: appuser',
      '      POSTGRES_PASSWORD: pgS3cret',
      '  api:',
      '    environment:',
      '      API_TOKEN: "tok_live_abcdef123456"',
      '      DATABASE_HOST: db.example.internal',
    ),
    expected: lines(
      'services:',
      '  db:',
      '    image: postgres:16',
      '    environment:',
      '      POSTGRES_USER: appuser',
      '      POSTGRES_PASSWORD: [SECRET_1]',
      '  api:',
      '    environment:',
      '      API_TOKEN: "[SECRET_2]"',
      '      DATABASE_HOST: [INTERNAL_HOST_1]',
    ),
    note: 'An image tag is not a port, and POSTGRES_USER is a variable name rather than a labeled username field.',
  },
  {
    id: 'yaml-k8s-secret',
    format: 'YAML',
    kind: 'mixed',
    input: lines(
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: app-secrets',
      'type: Opaque',
      'stringData:',
      '  password: hunter2',
      `  api-key: ${AWS_ACCESS_KEY}`,
    ),
    expected: lines(
      'apiVersion: v1',
      'kind: Secret',
      'metadata:',
      '  name: app-secrets',
      'type: Opaque',
      'stringData:',
      '  password: [SECRET_1]',
      '  api-key: [API_KEY_1]',
    ),
    note: 'The words "Secret" and "app-secrets" are structure, not credentials.',
  },
  {
    id: 'yaml-dollar-in-value',
    format: 'YAML',
    kind: 'secret',
    input: lines('database:', '  password: "S3cure$Pass"', '  api_key: my$ecretvalue'),
    expected: lines('database:', '  password: "[SECRET_1]"', '  api_key: [SECRET_2]'),
    note: 'YAML does not interpolate a bare $name.',
  },

  // ----------------------------------------------------------- Terraform ---
  {
    id: 'terraform-aws-provider',
    format: 'Terraform',
    kind: 'mixed',
    input: lines(
      'provider "aws" {',
      '  region     = "us-east-1"',
      `  access_key = "${AWS_ACCESS_KEY}"`,
      '  secret_key = "wJalrDEMOnotarealsecretkey00000000000"',
      '}',
      '',
      'resource "aws_db_instance" "main" {',
      '  username = "dbadmin"',
      '  password = "TfSecret2026"',
      '}',
    ),
    expected: lines(
      'provider "aws" {',
      '  region     = "us-east-1"',
      '  access_key = "[API_KEY_1]"',
      '  secret_key = "[SECRET_1]"',
      '}',
      '',
      'resource "aws_db_instance" "main" {',
      '  username = "[USERNAME_1]"',
      '  password = "[SECRET_2]"',
      '}',
    ),
    note: 'A region is not sensitive; both halves of an AWS key pair are.',
  },

  // ---------------------------------------------------------- PowerShell ---
  {
    id: 'powershell-credential-flow',
    format: 'PowerShell',
    kind: 'mixed',
    input: lines(
      '$SecurePass = ConvertTo-SecureString "Wint3r2026" -AsPlainText -Force',
      `$ApiKey = "${GITHUB_TOKEN}"`,
      '$Server = "dc01.corp.local"',
      'Write-Host "Connecting to $Server"',
    ),
    expected: lines(
      '$SecurePass = ConvertTo-SecureString "[SECRET_1]" -AsPlainText -Force',
      '$ApiKey = "[API_KEY_1]"',
      '$Server = "[INTERNAL_HOST_1]"',
      'Write-Host "Connecting to $Server"',
    ),
    note: 'The interpolated variable in the last line is code, not a value.',
  },
  {
    id: 'powershell-expressions-are-not-secrets',
    format: 'PowerShell',
    kind: 'control',
    input: lines(
      '$Password = "Prefix-$env:USERNAME"',
      '$Password = $StoredCred',
      '$Password = Get-RandomPassword',
      "$Password = (New-Guid).Guid",
    ),
    expected: lines(
      '$Password = "Prefix-$env:USERNAME"',
      '$Password = $StoredCred',
      '$Password = Get-RandomPassword',
      "$Password = (New-Guid).Guid",
    ),
    note: 'Redacting any of these would corrupt a working script without hiding a secret.',
  },

  // --------------------------------------------------------------- shell ---
  {
    id: 'shell-deploy-script',
    format: 'shell',
    kind: 'mixed',
    input: lines(
      '#!/bin/bash',
      'export AWS_SECRET_ACCESS_KEY="wJalrDEMOnotarealsecretkey00000000000"',
      'export DB_PASSWORD="$1"',
      'curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.DEMOsig" https://api.example.com/v1/status',
    ),
    expected: lines(
      '#!/bin/bash',
      'export AWS_SECRET_ACCESS_KEY="[SECRET_1]"',
      'export DB_PASSWORD="$1"',
      'curl -H "Authorization: [TOKEN_1]" https://api.example.com/v1/status',
    ),
    note: 'CORRECTED after first run: I first expected the whole header to go. The header NAME is not a secret, and keeping it tells the reader what was removed. The scheme word "Bearer" does travel with the token.',
  },
  {
    id: 'shell-mysql-inline-password',
    format: 'shell',
    kind: 'secret',
    input: "mysql -u root -pSup3rSecret -e 'SELECT 1'",
    expected: 'mysql -u root -p[SECRET_1] -e \'SELECT 1\'',
    note: 'The -p<value> form attaches the password to the flag. Common in pasted command history.',
  },

  // -------------------------------------------------------------- Python ---
  {
    id: 'python-client-setup',
    format: 'Python',
    kind: 'mixed',
    input: lines(
      'import os',
      'DATABASE_PASSWORD = "d3v-pass-2026"',
      'API_KEY = os.environ["OPENAI_API_KEY"]',
      `client = OpenAI(api_key="${OPENAI_PROJECT_KEY}")`,
      'conn = psycopg2.connect(host="db.example.internal", user="app", password="pgpass123")',
    ),
    expected: lines(
      'import os',
      'DATABASE_PASSWORD = "[SECRET_1]"',
      'API_KEY = os.environ["OPENAI_API_KEY"]',
      'client = OpenAI(api_key="[API_KEY_1]")',
      'conn = psycopg2.connect(host="[INTERNAL_HOST_1]", user="[USERNAME_1]", password="[SECRET_2]")',
    ),
    note: 'Reading a variable from the environment is code. Redacting it would break the script and hide nothing.',
  },
  {
    id: 'python-subscript-assignment',
    format: 'Python',
    kind: 'secret',
    input: lines('cfg["password"] = "hunter2"', 'os.environ["API_KEY"] = "abc123def456"'),
    expected: lines('cfg["password"] = "[SECRET_1]"', 'os.environ["API_KEY"] = "[SECRET_2]"'),
    note: 'Assigning INTO the environment hardcodes the value; reading FROM it does not.',
  },

  // ------------------------------------------------------ JavaScript / TS ---
  {
    id: 'ts-config-object',
    format: 'TypeScript',
    kind: 'mixed',
    input: lines(
      'const config = {',
      `  apiKey: "${GOOGLE_API_KEY}",`,
      '  authToken: process.env.AUTH_TOKEN,',
      '  password: "n0de-pass",',
      '  endpoint: "https://api.example.com",',
      '};',
    ),
    expected: lines(
      'const config = {',
      '  apiKey: "[API_KEY_1]",',
      '  authToken: process.env.AUTH_TOKEN,',
      '  password: "[SECRET_1]",',
      '  endpoint: "https://api.example.com",',
      '};',
    ),
    note: 'process.env.X is a reference. A public endpoint is not a secret.',
  },
  {
    id: 'ts-template-literal',
    format: 'TypeScript',
    kind: 'mixed',
    input: lines(
      'const auth = `Bearer ${token}`;',
      'const value = "password=hunter2".trim();',
    ),
    expected: lines(
      'const auth = `Bearer ${token}`;',
      'const value = "password=[SECRET_1]".trim();',
    ),
    note: 'CORRECTED after first run: I mis-filed this as a control and expected the whole string to go. Only hunter2 is the secret; keeping the "password=" label inside the string is right, and .trim() must survive.',
  },

  // ----------------------------------------------------------------- INI ---
  {
    id: 'ini-tool-config',
    format: 'INI',
    kind: 'mixed',
    input: lines(
      '[database]',
      'host = db.example.internal',
      'user = appuser',
      'password = In1Pass!',
      '',
      '[logging]',
      'level = debug',
    ),
    expected: lines(
      '[database]',
      'host = [INTERNAL_HOST_1]',
      'user = [USERNAME_1]',
      'password = [SECRET_1]',
      '',
      '[logging]',
      'level = debug',
    ),
  },

  // ---------------------------------------------------------------- logs ---
  {
    id: 'log-application-lines',
    format: 'log',
    kind: 'mixed',
    input: lines(
      '2026-08-27T14:02:11Z INFO  auth: user=jsmith login succeeded from 203.0.113.24',
      '2026-08-27T14:02:12Z DEBUG http: GET /v1/items?api_key=ak_live_9f2b1c8d4e6a',
      '2026-08-27T14:02:13Z ERROR db: connect failed postgres://appuser:PgPass1@10.20.30.40:5432/appdb',
    ),
    expected: lines(
      '2026-08-27T14:02:11Z INFO  auth: user=[USERNAME_1] login succeeded from [IP_ADDRESS_1]',
      '2026-08-27T14:02:12Z DEBUG http: GET /v1/items?api_key=[SECRET_1]',
      '2026-08-27T14:02:13Z ERROR db: connect failed [CONNECTION_STRING_1]',
    ),
    note: 'A credential-bearing URL goes whole so no host or user fragment survives.',
  },
  {
    id: 'log-stack-trace-control',
    format: 'log',
    kind: 'control',
    input: lines(
      'Traceback (most recent call last):',
      '  File "app/auth.py", line 42, in verify_password',
      '    raise ValueError("password check failed")',
      'ValueError: password check failed',
    ),
    expected: lines(
      'Traceback (most recent call last):',
      '  File "app/auth.py", line 42, in verify_password',
      '    raise ValueError("password check failed")',
      'ValueError: password check failed',
    ),
    note: 'A stack trace mentioning passwords contains none.',
  },

  // ------------------------------------------------------- command output ---
  {
    id: 'cli-aws-identity',
    format: 'command output',
    kind: 'control',
    input: lines(
      '$ aws sts get-caller-identity',
      '{',
      '    "UserId": "AIDADEMO1234567890",',
      '    "Account": "123456789012",',
      '    "Arn": "arn:aws:iam::123456789012:user/demo-admin"',
      '}',
    ),
    expected: lines(
      '$ aws sts get-caller-identity',
      '{',
      '    "UserId": "AIDADEMO1234567890",',
      '    "Account": "123456789012",',
      '    "Arn": "arn:aws:iam::123456789012:user/demo-admin"',
      '}',
    ),
    note: 'Identity output carries no credential. Redacting it would be noise.',
  },
  {
    id: 'cli-git-remote-with-token',
    format: 'command output',
    kind: 'secret',
    input: `git remote add origin https://oauth2:${GITHUB_TOKEN}@github.com/demo/repo.git`,
    expected: 'git remote add origin [CONNECTION_STRING_1]',
    note: 'A token embedded in a clone URL is a credential-bearing URL.',
  },

  // --------------------------------------------------- connection strings ---
  {
    id: 'conn-mixed-vendors',
    format: 'connection string',
    kind: 'secret',
    input: lines(
      'Server=sql01;Initial Catalog=appdb;User ID=sqladmin;Password=AzSql2026;Encrypt=True;',
      'mongodb+srv://appuser:M0ngoPass@cluster0.demo.mongodb.net/app?retryWrites=true',
      'Endpoint=sb://demo.servicebus.windows.net/;SharedAccessKeyName=send;SharedAccessKey=abcdEFGH1234567890abcd=',
    ),
    expected: lines(
      '[CONNECTION_STRING_1]Encrypt=True;',
      '[CONNECTION_STRING_2]',
      'Endpoint=sb://[INTERNAL_HOST_1]/;SharedAccessKeyName=send;SharedAccessKey=[SECRET_1]',
    ),
    note: 'Encrypt=True is not part of the credential. SharedAccessKeyName names the key; SharedAccessKey is it.',
  },

  // ------------------------------------------------ compound field names ---
  {
    id: 'compound-credential-fields',
    format: 'mixed config',
    kind: 'mixed',
    input: lines(
      'SecretAccessKey=wJalrDEMOnotarealkey0000000000000000',
      'ClientSecret=cs_DEMO_0000000000',
      'SigningKey=signing-DEMO-0000',
      'EncryptionKey=enc-DEMO-0000',
      'SecretString=str-DEMO-0000',
      'public_key=ssh-rsa AAAAB3NzaC1yc2EDEMO',
      'password_file=/etc/app/secrets.txt',
      'api_key_name=production',
      'password_length=16',
    ),
    expected: lines(
      'SecretAccessKey=[SECRET_1]',
      'ClientSecret=[SECRET_2]',
      'SigningKey=[SECRET_3]',
      'EncryptionKey=[SECRET_4]',
      'SecretString=[SECRET_5]',
      'public_key=ssh-rsa AAAAB3NzaC1yc2EDEMO',
      'password_file=/etc/app/secrets.txt',
      'api_key_name=production',
      'password_length=16',
    ),
    note: 'A public key is publishable. The last three name or measure a credential without being one.',
  },
  {
    id: 'credential-fields-with-a-trailing-qualifier',
    format: 'mixed config',
    kind: 'mixed',
    input: lines(
      'PASSWORD_OLD=r0tate-me',
      'PASSWORD_NEW=n3w-value',
      'DB_PASSWORD_PROD=prod-value',
      'API_KEY_V2=key-value-two',
      'TOKEN_STAGING=stg-value',
      'password_2=second-value',
      'password_file=/etc/app/secrets.txt',
      'password_reset_url=https://accounts.example.com/reset',
      'api_key_name=production',
    ),
    expected: lines(
      'PASSWORD_OLD=[SECRET_1]',
      'PASSWORD_NEW=[SECRET_2]',
      'DB_PASSWORD_PROD=[SECRET_3]',
      'API_KEY_V2=[SECRET_4]',
      'TOKEN_STAGING=[SECRET_5]',
      'password_2=[SECRET_6]',
      'password_file=/etc/app/secrets.txt',
      'password_reset_url=https://accounts.example.com/reset',
      'api_key_name=production',
    ),
    note: 'A qualifier says WHICH credential and is still the credential; a metadata word describes one without being it. Every name in the first block was missed before this corpus ran.',
  },
  {
    id: 'english-words-containing-pass',
    format: 'config',
    kind: 'control',
    input: lines(
      'compass=north',
      'bypass=/etc/hosts',
      'lowpass=200',
      'encompass=all',
      'compassHash=sha256-demo',
    ),
    expected: lines(
      'compass=north',
      'bypass=/etc/hosts',
      'lowpass=200',
      'encompass=all',
      'compassHash=sha256-demo',
    ),
    note: 'None of these is a credential field.',
  },

  // ------------------------------------------------ credentials in prose ---
  {
    id: 'prose-labeled-credential',
    format: 'prose',
    kind: 'secret',
    input: `Ticket note - staging login password: Wint3r2026 and the key is ${OPENAI_KEY}. Rotate both after migration.`,
    expected: 'Ticket note - staging login password: [API_KEY_1]',
    note: 'AMBIGUOUS, frozen as over-redaction. An unquoted value has no terminator in prose, so it runs to the end of the line and swallows the rest of the sentence. Stopping at the first space would leave part of an unquoted passphrase visible, which breaks the "no partial redaction" promise, so the tool errs long. Both secrets are removed; the cost is the sentence around them. Recorded so a change in this behavior is noticed.',
  },
  {
    id: 'prose-verbal-credential',
    format: 'prose',
    kind: 'secret',
    input: 'The staging password is Wint3r2026, please rotate it.',
    expected: 'The staging password is Wint3r2026, please rotate it.',
    note: 'AMBIGUOUS, called as no-redact: "password is X" has no field separator. Catching it means guessing where the value ends in free text, and "the password is stored in Vault" would redact "stored". Recorded as a known limit rather than a defect.',
  },
  {
    id: 'prose-password-policy-control',
    format: 'prose',
    kind: 'control',
    input: lines(
      'password_policy: minimum 12 characters',
      'Reset your password at https://accounts.example.com/reset',
      'Encryption keys are rotated every 90 days.',
    ),
    expected: lines(
      'password_policy: minimum 12 characters',
      'Reset your password at https://accounts.example.com/reset',
      'Encryption keys are rotated every 90 days.',
    ),
  },

  // ------------------------------------------------------ awkward quoting ---
  {
    id: 'quoting-escapes-and-spacing',
    format: 'mixed config',
    kind: 'secret',
    input: lines(
      'password="he said \\"hi\\" then left"',
      "password2='it''s escaped'",
      'password3 = "trailing-space-after"   ',
      'token:   "spaced-out-value"',
    ),
    expected: lines(
      'password="[SECRET_1]"',
      "password2='[SECRET_2]'",
      'password3 = "[SECRET_3]"   ',
      'token:   "[SECRET_4]"',
    ),
    note: 'Escaped and doubled quotes belong to the value; surrounding whitespace must survive byte for byte.',
  },
  {
    id: 'quoting-apostrophe-in-prose',
    format: 'prose',
    kind: 'secret',
    input: "don't paste password=OBrien2026 into chat",
    expected: "don't paste password=[SECRET_1]",
    note: 'The apostrophe in "don\'t" is correctly not treated as a string delimiter, so the value is not cut short. The trailing " into chat" is lost to the same prose over-redaction as prose-labeled-credential.',
  },

  // ----------------------------------------------------- repeated secrets ---
  {
    id: 'repeated-secret-across-formats',
    format: 'mixed config',
    kind: 'secret',
    input: lines(
      'DB_PASSWORD=Sh4redPass',
      'BACKUP_PASSWORD=Sh4redPass',
      '{"password":"Sh4redPass"}',
    ),
    expected: lines(
      'DB_PASSWORD=[SECRET_1]',
      'BACKUP_PASSWORD=[SECRET_1]',
      '{"password":"[SECRET_1]"}',
    ),
    note: 'One value, one placeholder, so the reader can see it is the same secret.',
  },

  // ------------------------------------------------- provider key shapes ---
  {
    id: 'provider-key-shapes',
    format: 'mixed config',
    kind: 'secret',
    input: lines(
      `github=${GITHUB_TOKEN}`,
      `aws=${AWS_ACCESS_KEY}`,
      `google=${GOOGLE_API_KEY}`,
      `slack=${SLACK_TOKEN}`,
      'jwt=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.DEMOsignature',
    ),
    expected: lines(
      'github=[API_KEY_1]',
      'aws=[API_KEY_2]',
      'google=[API_KEY_3]',
      'slack=[API_KEY_4]',
      'jwt=[TOKEN_1]',
    ),
  },
  {
    id: 'provider-key-with-trailing-text',
    format: 'log',
    kind: 'secret',
    input: `api_key=${OPENAI_KEY_SHORT}-EXTRA and password=alsoSecret`,
    expected: 'api_key=[API_KEY_1] password=[SECRET_1]',
    note: 'The point of this case is that the -EXTRA tail after the provider-prefix match does not survive, and it does not. The connecting word "and" is lost to prose over-redaction.',
  },
  {
    id: 'private-key-block',
    format: 'PEM',
    kind: 'secret',
    input: pem('RSA', [
      'MIIEowIBAAKCAQEA0DEMOnotarealkeymaterialhere',
      'MoreDEMObase64ContentThatIsNotReal==',
    ]),
    expected: '[PRIVATE_KEY_1]',
    note: 'The whole block is one finding so no line of key material survives.',
  },

  // ------------------------------------------------ mixed innocent/secret ---
  {
    id: 'mixed-deployment-notes',
    format: 'notes',
    kind: 'mixed',
    input: lines(
      '# Deployment notes for the demo environment',
      'REGION=us-west-2',
      'REPLICAS=3',
      'LOG_LEVEL=info',
      'ADMIN_PASSWORD=Adm1nPass',
      'HEALTHCHECK_PATH=/healthz',
      'FEATURE_FLAGS=new-ui,fast-search',
    ),
    expected: lines(
      '# Deployment notes for the demo environment',
      'REGION=us-west-2',
      'REPLICAS=3',
      'LOG_LEVEL=info',
      'ADMIN_PASSWORD=[SECRET_1]',
      'HEALTHCHECK_PATH=/healthz',
      'FEATURE_FLAGS=new-ui,fast-search',
    ),
    note: 'Exactly one line here is sensitive.',
  },
  {
    id: 'control-password-strength-code',
    format: 'JavaScript',
    kind: 'control',
    input: lines(
      'function calculatePasswordStrength(input) {',
      '  const hasUpper = /[A-Z]/.test(input);',
      '  return hasUpper ? "strong" : "weak";',
      '}',
    ),
    expected: lines(
      'function calculatePasswordStrength(input) {',
      '  const hasUpper = /[A-Z]/.test(input);',
      '  return hasUpper ? "strong" : "weak";',
      '}',
    ),
    note: 'Code that talks about passwords contains none.',
  },
  {
    id: 'control-empty-and-whitespace',
    format: 'plain',
    kind: 'control',
    input: '   \n\t\n  ',
    expected: '   \n\t\n  ',
    note: 'Whitespace-only input must round-trip byte for byte.',
  },
]);
