import { SYNTHETIC_STRIPE_SHAPED_KEY } from './synthetic';

/**
 * Obviously synthetic demo text. Every value is fake and labeled as such:
 * example.internal domains, DEMO/not-real tokens, RFC 5737-adjacent data.
 */
export const DEMO_TEXT = `2026-07-01 09:42:11 [INFO] Deployment failed on ws-144.example.internal
User: alex.demo@example.internal
Username: ademo
Token: Bearer eyJhbGciOiJIUzI1NiJ9.eyJkZW1vIjoibm90LXJlYWwtdG9rZW4ifQ.ZmFrZS1zaWduYXR1cmUtbm90LXJlYWw
api_key=${SYNTHETIC_STRIPE_SHAPED_KEY}
password = "demo-horse-battery-not-real"
Internal URL: https://admin.example.internal/api/v1/status
Host IP: 10.42.16.28   Backup: 172.16.5.10   Gateway: 2001:db8::1
Log: C:\\Users\\alex.demo\\AppData\\Local\\Temp\\deploy\\run.log
Also written to /home/ademo/deploy/run.log
Copy from \\\\fs01\\Deploy$\\packages\\agent.msi
Move-ADObject -TargetPath "OU=Terminated Users,DC=ad,DC=example,DC=test"
TenantId: 11111111-2222-3333-4444-555555555555
$BackupPass = ConvertTo-SecureString "demo-secret-not-real" -AsPlainText -Force
Get-ADUser -Identity ademo -Server dc01.example.test
Connect: postgres://svc_app:demo-pw-not-real@db01.example.test:5432/appdb
-----BEGIN RSA PRIVATE KEY-----
MIIDEMOxNOTxAxREALxKEYxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----
Owner: Alex Demo   Company: Contoso Health
Ticket: INC104892   Related: OPS-2214
Contact alex.demo@example.internal if the retry fails.`;

/**
 * Personal/PII sample for exercising the Strict profile and payment-card
 * rule. Every value is synthetic: 4111... is the standard Visa test number,
 * and 123 456 782 is a checksum-valid but obviously sequential fake SIN.
 */
export const DEMO_TEXT_PII = `Patient intake draft (synthetic data only)
Name: Alex Demo   DOB: 1990-01-31
Phone: (555) 123-4567   Email: alex.demo@example.internal
Address: 123 Demo Street, Exampleville
SIN: 123 456 782   HealthCard: 1234-567-890
MRN: 12-345678   PatientID: AB123456
Card: 4111 1111 1111 1111   Expiry: 01/30
Employer: Contoso Health
Note: escalate to Dr. Demo if the portal rejects the record.`;
