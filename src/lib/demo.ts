import {
  SYNTHETIC_ANTHROPIC_API_KEY,
  SYNTHETIC_AWS_ACCESS_KEY_ID,
  SYNTHETIC_BEARER_TOKEN,
  SYNTHETIC_GITHUB_TOKEN,
  SYNTHETIC_STRIPE_SHAPED_KEY,
} from './synthetic';

/**
 * Obviously synthetic demo text. Every value is fake and labeled as such:
 * example.internal domains, DEMO/not-real tokens, RFC 5737-adjacent data.
 */
export const DEMO_TEXT = `Incident writeup — sanitize before posting publicly
2026-07-01 09:42:11 [INFO] Deploy failed on ws-144.example.internal — agent version 10.0.0.0
NIC 00:1A:2B:3C:4D:5E   Host IP: 10.42.16.28   Public edge: 203.0.113.24   Gateway: 2001:db8::1
User: alex.demo@example.internal   Username: ademo
Authorization: Bearer ${SYNTHETIC_BEARER_TOKEN}
AWS_ACCESS_KEY_ID=${SYNTHETIC_AWS_ACCESS_KEY_ID}
GITHUB_TOKEN=${SYNTHETIC_GITHUB_TOKEN}
ANTHROPIC_API_KEY=${SYNTHETIC_ANTHROPIC_API_KEY}
api_key=${SYNTHETIC_STRIPE_SHAPED_KEY}
$BackupPass = ConvertTo-SecureString "demo-secret-not-real" -AsPlainText -Force
Internal URL: https://admin.example.internal/api/v1/status
Windows log: C:\\Users\\alex.demo\\AppData\\Local\\Temp\\deploy\\run.log
Linux log: /home/ademo/deploy/run.log
Package: \\\\fs01\\Deploy$\\packages\\agent.msi
Move-ADObject -TargetPath "OU=Terminated Users,DC=ad,DC=example,DC=test"
TenantId: 11111111-2222-3333-4444-555555555555
DB: postgres://svc_app:demo-pw-not-real@db01.example.test:5432/appdb
-----BEGIN RSA PRIVATE KEY-----
•••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••••
-----END RSA PRIVATE KEY-----
Reported by: Alex Demo, Contoso Health   Ticket: INC104892 / OPS-2214
Affected record (Strict mode adds the labeled personal fields below):
Name: Bea Example   DOB: 1990-01-31   Phone: (555) 123-4567
Address: 123 Demo Street, Exampleville
SIN: 123 456 782   HealthCard: 1234-567-890
Card: 4111 1111 1111 1111   Expiry: 01/30
Directory export:
DisplayName,Company,Email
Alex Demo,Contoso Health,alex.demo@example.internal
Built-in rules can't know org codenames like Project Nightjar — add those to a Cloak List.
Contact alex.demo@example.internal if the retry fails.
agent version 10.0.0.0 must stay un-redacted (verify after Part 2).
${SYNTHETIC_AWS_ACCESS_KEY_ID} is AWS's documented example key.`;
