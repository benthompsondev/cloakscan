import { SYNTHETIC_STRIPE_SHAPED_KEY } from './synthetic';

/**
 * Human-facing guidance for each detection rule, shown in Settings.
 * `sample` must always be obviously synthetic — it powers the replacement
 * preview by being scanned with only that rule enabled.
 */
export interface RuleInfo {
  /** What the rule actually looks for. */
  detects: string;
  /** Realistic false positives to watch for when reviewing findings. */
  falsePositives: string;
  /** How much to trust a match, in one line. */
  confidence: string;
  /** Synthetic sample text used for the live replacement preview. */
  sample: string;
}

export const RULE_INFO: Record<string, RuleInfo> = {
  'bearer-token': {
    detects: 'Authorization bearer credentials: the word "Bearer" plus the token that follows it.',
    falsePositives: 'Rare. Placeholder tokens in documentation will still match.',
    confidence: 'High — the Bearer scheme is unambiguous.',
    sample: 'Authorization: Bearer demo_token_not_real_4f8a72',
  },
  'api-key': {
    detects: 'Known API key shapes: Stripe/OpenAI-style sk_ keys, AWS AKIA ids, GitHub ghp_ tokens, Slack xox tokens, Google AIza keys.',
    falsePositives: 'Rare. Revoked or sample keys in docs still match by format.',
    confidence: 'High — provider prefixes are distinctive.',
    sample: `api_key=${SYNTHETIC_STRIPE_SHAPED_KEY}`,
  },
  jwt: {
    detects: 'JWT-shaped tokens: three base64url segments starting with eyJ.',
    falsePositives: 'Rare. Expired example JWTs from tutorials still match.',
    confidence: 'High — the eyJ header prefix is structural.',
    sample: 'token eyJhbGciOiJIUzI1NiJ9.eyJkZW1vIjoibm90LXJlYWwifQ.ZmFrZS1zaWc',
  },
  'secure-string-literal': {
    detects: 'Plaintext literals passed to ConvertTo-SecureString in PowerShell.',
    falsePositives: 'Rare. Only quoted literals match; variables are skipped.',
    confidence: 'High — a hardcoded credential by definition.',
    sample: 'ConvertTo-SecureString "demo-secret-not-real" -AsPlainText',
  },
  'ad-dn': {
    detects: 'Active Directory distinguished names ending in two or more DC= components.',
    falsePositives: 'Rare. LDAP examples in documentation still match.',
    confidence: 'High — the RDN chain structure is distinctive.',
    sample: 'TargetPath "OU=Terminated Users,DC=ad,DC=example,DC=test"',
  },
  'guid-identifier': {
    detects: 'GUIDs. Labeled cloud identifiers (TenantId, ClientId, SubscriptionId...) at high confidence; any other GUID at low confidence.',
    falsePositives: 'Bare GUIDs are often harmless correlation ids or product codes — review low-confidence matches.',
    confidence: 'High when labeled, low when bare.',
    sample: 'TenantId: 11111111-2222-3333-4444-555555555555',
  },
  'secret-assignment': {
    detects: 'Values assigned to password/secret-style keys, including compound names like $SmtpUserPass.',
    falsePositives: 'Variables named around "pass" with plain-word values, e.g. $BypassCode = "always".',
    confidence: 'Medium — context-based; booleans, variables, and cmdlets are filtered out.',
    sample: 'password = "demo-horse-battery-not-real"',
  },
  'internal-url': {
    detects: 'URLs whose host looks non-public: internal TLD suffixes, single-label hosts, private IPs, or onmicrosoft.com tenants.',
    falsePositives: 'Rare. Public URLs are skipped entirely.',
    confidence: 'High — the host shape is checked, not guessed.',
    sample: 'see https://admin.example.internal/api/v1/status',
  },
  'unc-path': {
    detects: 'UNC network paths like \\\\server\\share$\\folder, including admin shares.',
    falsePositives: 'Escaped-backslash strings in code can resemble UNC paths; the share segment is required to reduce this.',
    confidence: 'High — the \\\\server\\share structure is distinctive.',
    sample: 'Import-Csv "\\\\fs01\\Deploy$\\uploads\\accounts.csv"',
  },
  'windows-user-path': {
    detects: 'Absolute Windows paths, including quoted paths and paths with spaces.',
    falsePositives: 'Public example or standard system paths may not need redaction.',
    confidence: 'High — a drive letter plus backslash path is structurally clear.',
    sample: 'Log: "C:\\Users\\Alex Demo\\AppData\\Local\\run log.txt"',
  },
  'unix-user-path': {
    detects: 'Unix home-directory paths under /home/ or /Users/.',
    falsePositives: 'Rare. Container docs often use /home/user examples.',
    confidence: 'High — only home paths are targeted.',
    sample: 'written to /home/ademo/deploy/run.log',
  },
  email: {
    detects: 'Email addresses, @domain suffixes used in templates, and labeled mail/UPN domains.',
    falsePositives: 'Role addresses and public mail-domain examples may not need redaction.',
    confidence: 'High — the format is unambiguous.',
    sample: 'UPN template: "$alias@example.internal"',
  },
  'ps-infrastructure-assignment': {
    detects: 'Quoted host values assigned to infrastructure-style variables like $SmtpServer or $DomainController.',
    falsePositives: 'Public vendor hostnames assigned to those variables also match.',
    confidence: 'Medium — driven by the variable name.',
    sample: '$SmtpServer = "relay01.example.test"',
  },
  'ps-identity-param': {
    detects: 'Literal account names passed to -Identity, -SamAccountName, and similar PowerShell parameters.',
    falsePositives: 'Group or object names passed to -Identity are flagged as if they were accounts.',
    confidence: 'Medium — literal values only; variables are skipped.',
    sample: 'Get-ADUser -Identity jdemo.account',
  },
  'ps-server-param': {
    detects: 'Literal server names passed to -Server, -ComputerName, -SmtpServer, and similar parameters.',
    falsePositives: 'Public service hostnames used in those parameters also match.',
    confidence: 'Medium — literal values only.',
    sample: 'Get-ADUser x -Server dc01.example.test',
  },
  ipv6: {
    detects: 'Valid IPv6 addresses, including compressed :: forms.',
    falsePositives: 'Loopback (::1) and unspecified (::) are flagged at low confidence.',
    confidence: 'High — every candidate is strictly validated.',
    sample: 'Gateway: 2001:db8::1',
  },
  ipv4: {
    detects: 'Valid dotted-quad IPv4 addresses.',
    falsePositives: 'Version strings that look like addresses are rejected; loopback is low confidence.',
    confidence: 'High — octets are range-checked.',
    sample: 'Host IP: 10.42.16.28',
  },
  'internal-hostname': {
    detects: 'Hostnames with internal suffixes (.local, .internal, .corp, .lan...) and onmicrosoft.com tenant domains.',
    falsePositives: 'mDNS names like printer.local may be harmless.',
    confidence: 'High — suffix-based, no guessing.',
    sample: 'deployed on ws-144.example.internal',
  },
  'ticket-id': {
    detects: 'ServiceNow-style ticket numbers (INC/CHG/REQ...) and Jira-style keys.',
    falsePositives: 'Acronym-number pairs can resemble Jira keys; common ones are excluded, the rest are medium confidence.',
    confidence: 'High for ServiceNow shapes, medium for Jira shapes.',
    sample: 'Ticket: INC104892 Related: OPS-2214',
  },
  username: {
    detects: 'Account names in labeled contexts only: user:, username=, login:.',
    falsePositives: 'Service or template account examples still match.',
    confidence: 'Medium — context-based.',
    sample: 'Username: ademo',
  },
  'person-name': {
    detects:
      'Names in explicit fields (including quoted JSON keys), first/last-name fields, recognized CSV columns, clear author/contact bylines, and prose cues such as "prepared by", "as per", or "Contact …". Strict profile only. Detection is contextual: free-text names without such context are NOT guessed — use a Cloak List for people you already know must be hidden.',
    falsePositives:
      'A product, group, or title-cased phrase can resemble a person after a prose cue ("written by GitHub Copilot") or an honorific. Review findings and toggle off anything harmless.',
    confidence:
      'Low — contextual detection cannot guarantee every name is found or that every finding is a real person.',
    sample: '# Author: Alex Demo',
  },
  'org-name': {
    detects:
      'Organizations in company, employer, department, facility, client, and similar fields (including quoted JSON keys), recognized CSV columns, copyright lines, and organization-shaped comment context. Strict profile only. Free-text organization mentions without such context are NOT guessed — use a Cloak List for known aliases and acronyms.',
    falsePositives:
      'Product, team, or system names in organization-style fields, copyright lines, or strong-suffix phrases.',
    confidence:
      'Low — contextual detection cannot guarantee every organization is found or that every finding is a real organization.',
    sample: 'Copyright (c) 2024 Contoso Regional Hospital',
  },
  'private-key': {
    detects: 'Complete PEM, RSA/EC/DSA, OpenSSH, and PGP private-key blocks from BEGIN to END.',
    falsePositives: 'Rare. Example keys in documentation still match — as they should.',
    confidence: 'High — the BEGIN/END armor is unambiguous.',
    sample:
      '-----BEGIN RSA PRIVATE KEY-----\nMIIDEMOxNOTxAxREALxKEYxxxxxxxxxxxxxxxx\n-----END RSA PRIVATE KEY-----',
  },
  'connection-string': {
    detects: 'Connection strings carrying credentials: scheme://user:password@host URLs and Server=...;Password=...; key-value strings. The whole string is one finding.',
    falsePositives: 'Rare. Credential-free URLs and connection strings are ignored.',
    confidence: 'High — credentials must actually be present.',
    sample: 'postgres://svc_app:demo-pass-not-real@db01.example.test:5432/appdb',
  },
  'payment-card': {
    detects: 'Payment card numbers, 13-19 digits with optional grouping, validated by issuer range and the Luhn checksum.',
    falsePositives: 'Rare after validation; random digit runs almost never pass Luhn plus a known issuer prefix.',
    confidence: 'High when grouped, medium as a bare digit run.',
    sample: 'Card: 4111 1111 1111 1111',
  },
  'phone-number': {
    detects: 'North American phone numbers in explicit Phone/Mobile/Cell/Tel/Fax fields. Strict profile only.',
    falsePositives: 'Help-desk or public office numbers in those fields may not need redaction.',
    confidence: 'High — labeled field plus a full number shape.',
    sample: 'Phone: (555) 123-4567',
  },
  'physical-address': {
    detects: 'Street addresses in explicit Address-style fields on one line, starting with a street number. Strict profile only.',
    falsePositives: 'Office or site addresses that are public anyway.',
    confidence: 'Medium — labeled and number-led, but address shapes vary widely.',
    sample: 'Address: 123 Demo Street, Exampleville',
  },
  'date-of-birth': {
    detects: 'Dates in explicit DOB/DateOfBirth/BirthDate fields (ISO, slashed, or written-out shapes). Strict profile only.',
    falsePositives: 'Rare — the field label carries the meaning.',
    confidence: 'High — labeled field plus a date shape.',
    sample: 'DOB: 1990-01-31',
  },
  'canadian-sin': {
    detects: 'Canadian Social Insurance Numbers: labeled SIN fields, or conventionally grouped 123-456-782 forms. Every candidate must pass the SIN Luhn checksum and issued-range check. Strict profile only.',
    falsePositives: 'A grouped 9-digit number that coincidentally passes the checksum (~1 in 10).',
    confidence: 'High when labeled, medium when only grouped.',
    sample: 'SIN: 123 456 782',
  },
  'health-identifier': {
    detects: 'Identifiers in explicit MRN/HealthCard/HCN/PHN/PatientID fields (6-15 characters, at least four digits). Strict profile only.',
    falsePositives: 'Synthetic or test chart numbers in those fields.',
    confidence: 'High — labeled clinical fields are rarely anything else.',
    sample: 'MRN: 12-345678',
  },
  'ca-postal-code': {
    detects: 'Canadian postal codes (A1A 1A1, spaced or compact, valid letter sets) on lines with PostalCode/ZIP/Address-style context. Canada Pack.',
    falsePositives: 'Codes quoted in shipping documentation. Standalone letter-digit triples without address context are never flagged.',
    confidence: 'High — shape plus letter restrictions plus context.',
    sample: 'Address: 123 Demo Street, Exampleville ON K1A 0B1',
  },
  'us-ssn': {
    detects: 'US Social Security Numbers: labeled SSN fields (any grouping) or the canonical 123-45-6789 dashed shape, always checked against issued ranges (no 000/666/9xx area, 00 group, or 0000 serial). United States Pack.',
    falsePositives: 'A dashed nine-digit number that happens to fall in an issued range. Bare nine-digit runs are never flagged.',
    confidence: 'High when labeled, medium when only grouped.',
    sample: 'SSN: 123-45-6789',
  },
  'us-zip': {
    detects: 'US ZIP and ZIP+4 codes on lines with ZIP/Postal/Address-style context. United States Pack.',
    falsePositives: 'Five-digit quantities on an address-labeled line. Arbitrary five-digit numbers elsewhere are never flagged.',
    confidence: 'Medium — the shape is common; the context does the work.',
    sample: 'Address: 123 Demo Street, Exampletown NY ZIP: 12345-6789',
  },
  iban: {
    detects: 'International Bank Account Numbers with a known country prefix, that country\'s exact length, and a passing ISO 13616 MOD-97 checksum. Spaced or compact. EU Common Pack.',
    falsePositives: 'Very rare — the checksum plus country length rejects arbitrary alphanumeric strings.',
    confidence: 'High — checksummed.',
    sample: 'Refund to DE89 3704 0044 0532 0130 00 please',
  },
  'private-term': {
    detects:
      'Your session-only custom terms and reusable Cloak List terms, matched as exact words or phrases — never as a regular expression. Common apostrophe, dash, and horizontal-spacing variants are treated as equivalent.',
    falsePositives:
      'Substring collisions inside longer harmless words, only when "Also match inside longer words" is enabled.',
    confidence: 'High — you supplied the term.',
    sample: 'Contoso staff meeting notes',
  },
};
