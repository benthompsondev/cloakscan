# Detector behavior and safety

CloakScan findings are review leads, not verdicts. Pattern matching can miss
unusual sensitive values and can flag harmless identifiers. Review the cleaned
text before sharing it.

## Replacement safety

- PowerShell regex pattern strings used with `-replace`, `-match`, `-notmatch`,
  `Select-String -Pattern`, common `[regex]::Match`/`Matches`/`Replace` calls,
  and ordinary `switch -Regex` cases are protected before detectors run. This
  prevents ticket-like fragments and character classes from being rewritten.
- Password and secret assignments are replaced automatically only when the
  right-hand side is a quoted inline literal. Variables, command calls, and
  expressions such as `Generate-Password`, `$existingPassword`, or
  `(Get-RandomPassword)` are executable code, not pasted secrets, and remain
  unchanged.
- Username detection is intentionally conservative. It uses explicit labels
  such as `Username`, `SamAccountName`, and `UPN`, plus a small set of cmdlets
  where `-Identity` clearly means a user/account. Generic `-Identity`,
  `-Member`, and `-Members` arguments are not assumed to be usernames because
  they often contain AD group or display names.
- Infrastructure context matters. A quoted literal assigned to a variable or
  property ending in `Server`, `Host`, `Hostname`, `Endpoint`, `Uri`, `Url`,
  `ConnectionUri`, `Domain`, `Fqdn`, or `SmtpServer` is treated as
  infrastructure even when it uses an ordinary public DNS suffix.
- Email templates are handled without damaging PowerShell variables. In
  `"$alias@example.org"`, CloakScan replaces only `@example.org`; complete
  addresses and labeled mail/UPN domain fields are also detected.
- Absolute Windows paths are redacted as a whole, including quoted paths and
  paths containing spaces. Unquoted paths stop before a following PowerShell
  assignment so one finding cannot swallow neighboring code.

## v0.5 coverage additions

- **Private-key blocks** (Balanced): complete PEM/RSA/EC/OpenSSH/PGP blocks are
  redacted as one unit. A `BEGIN` header without its `END` marker is left for
  manual review rather than guessed at.
- **Connection strings** (Balanced): `scheme://user:password@host` URLs and
  `Server=...;Password=...;` strings are flagged only when credentials are
  actually embedded, and the whole string becomes one placeholder.
- **Payment cards** (Balanced): candidates must pass length (13-19),
  issuer-range plausibility, and the Luhn checksum. Grouped numbers are high
  confidence; bare digit runs are medium.
- **Strict-only PII** (phone, physical address, date of birth, Canadian SIN,
  health identifiers): every rule requires an explicitly labeled same-line
  field — labels and values can never cross or absorb a line boundary — except
  SINs, which are also accepted in conventionally grouped `123-456-782` form
  when they pass the SIN checksum and issued-range check. Bare 9-digit runs
  are never flagged.

## v0.6.1 custom-rule and regional hardening

- **No partial redaction, ever.** A custom labeled-field value that exceeds the
  rule's maximum length is skipped as a whole — replacing only a prefix would
  leave part of the sensitive value in output that looks fully sanitized. The
  rule editor's synthetic preview reports each skipped candidate and why.
- **Quote-aware values.** When a custom rule value opens with a quote and the
  matching close quote sits on the same line, only the content inside the
  quotes is redacted; both quotes and everything after the closing quote are
  preserved (`Department: "Operations" Status: Active` →
  `Department: "[CUSTOM_ID_1]" Status: Active`). An unclosed quote captures to
  the end of that line only — values never cross a CR/LF boundary.
- **Case-insensitive IBANs.** Upper, lower, and mixed-case IBANs are all
  detected. Case is normalized only for the MOD-97 checksum and country-length
  validation; the finding preserves the exact characters from the source.

## v1.0 coverage

- **Provider credentials:** fixed-prefix checks cover Anthropic, GitLab,
  GitHub fine-grained tokens, Stripe restricted/publishable keys, Twilio,
  SendGrid, npm, Google OAuth, Azure Storage account keys, Slack incoming
  webhooks, and Basic authorization headers. These are shape checks, not
  guesses about arbitrary long strings.
- **IPv4 context:** four-part versions after `version`, `build`, `release`,
  `FileVersion`, and similar cues stay untouched. Longer dotted runs,
  loopback, `0.0.0.0`, and `255.255.255.255` are ignored. Private and public
  host addresses still match.
- **MAC addresses:** six hexadecimal octets with one consistent separator are
  enabled in Balanced. All-zero and broadcast placeholders are ignored.
- **US Pack:** labeled ABA routing numbers and DEA registration numbers must
  pass their checksums. ITIN values require an ITIN label and issued middle
  range. EIN values require an EIN/Federal Tax ID label.
- **Passport fields:** Strict can cloak compact alphanumeric values in an
  explicit passport-number field. It does not scan free text for passport-like
  strings.
- **Custom term output:** Hide custom terms and Cloak Lists keep
  `[CUSTOM_TERM_n]` by default. A user can choose a separate safe format and
  placeholder label for those terms without changing the rest of the profile.

## v1.1 coverage

- **Provider and webhook credentials:** the API-key detector now has 33
  distinctive provider, webhook, and signed-URL patterns. New coverage
  includes OpenAI project keys, DigitalOcean, PyPI, Docker, Hugging Face,
  HashiCorp Vault, Databricks, Shopify, GitLab runner, Netlify, Brevo,
  age secret keys, Discord webhooks, Telegram bot tokens, and both AWS
  `AKIA` long-term and `ASIA` temporary access-key IDs.
- **Signed URL values:** Azure SAS `sig` and Amazon S3
  `X-Amz-Signature` values are detected only when they appear as URL query
  parameters. CloakScan replaces the value while preserving the parameter
  name and surrounding URL.
- **No entropy guessing:** these checks require a recognizable prefix or
  query parameter and a provider-specific shape. CloakScan does not flag an
  arbitrary long random-looking string as a secret.
- **Cleaner review suggestions:** common PowerShell colors, language
  keywords, log verbs, date-format tokens, and well-known technical acronyms
  no longer crowd the possible-name review panel. Multi-word names and project
  terms sort before single words and acronyms. Unknown acronyms still appear
  for human review.

## v1.2 coverage

- **Internal AD hostnames on public suffixes:** server-shaped internal hosts such as
  `DC02.ad.contoso.com` and `EXCH01.ad.contoso.on.ca` are treated as internal even
  though their final suffix is public. Public URLs such as GitHub, Microsoft, and
  ad-tech domains stay untouched.
- **LDAP and LDAPS URLs:** internal-looking LDAP(S) URLs are covered by the same
  internal URL rule. Public LDAP examples are skipped.
- **Network ports:** common service/admin ports are detected only beside a host/IP
  or in explicit port fields such as `Port: 587` or `SMTP port 465`. Bare numbers
  like `587 records processed` are ignored.
- **Cloak List text files:** reusable exact-match lists can be exported and imported
  as one-term-per-line `.txt` files. Imported values follow the same term caps and
  save-on-device opt-ins as typed terms.

## v1.3 coverage

- **AD group names:** quoted group names in `Add/Remove/Get-ADGroupMember -Identity`,
  `-MemberOf`, and `New-ADGroup -Name` are normal redactable findings — access and
  license group names describe your environment.
- **Review leads (start unchecked, never rewrite output):**
  - *Directory attributes* — `SamAccountName`, `UserPrincipalName`, `pwdLastSet`,
    `otherTelephone`, and friends. The attribute name is usually safe; the value on
    that line often is not. `mail` and `Enabled` only count with a code-ish prefix.
  - *Exchange workflow terms* — `Get-Recipient`, `RecipientTypeDetails`,
    `RemoteUserMailbox`, `Enable-RemoteMailbox`, `RemoteRoutingAddress`,
    `Import-PSSession`, and Exchange-configured `New-PSSession`.
  - *Credential workflow terms* — `Export/Import-Clixml`, `PSCredential`,
    `Send-MailMessage`, and SMTP credential helper names.
  - *Author initials* — 2–3 uppercase letters on comment lines mentioning
    Author/Modified/History/Revision, with a stoplist for common IT acronyms.
  - *Scheduled workflow artifacts* — `cycle_state.json`-style state files, audit
    logs, snapshots, and `.clixml` credential files.
  - *CSV identity headers* — comma-separated lines with three or more identity
    fields (Employee ID, AD username, UPN, email, activation date, ...).
- **Cloak List mappings and Portfolio-code mode:** term → replacement entries can
  rewrite mapped terms found in identifier position into valid generic identifiers
  (casing adapted). String literal contents, secrets, emails, URLs, hosts, ports,
  and paths keep bracket placeholders in both modes. See
  [output-modes.md](output-modes.md).

## Known boundaries

- Regex protection is a careful heuristic, not a complete PowerShell parser.
  Dynamically constructed patterns, here-strings, and unusual multiline syntax
  may still require manual review.
- Generic Jira-style IDs require a two-or-more-letter prefix, a hyphen, and at
  least two digits. They can still overlap with harmless product identifiers,
  so they remain medium-confidence findings.
- Contextual infrastructure and secret assignment rules only replace quoted
  literals. Values assembled from variables or expressions are left alone to
  preserve code semantics.
- Strict detects names and organizations in explicit fields (INI, YAML,
  PowerShell assignments and hashtables, and quoted JSON keys such as
  `"displayName"` or `"companyName"`), recognized CSV columns under a plausible
  header, clear author/contact bylines, matching email local-parts, prose cues such as "prepared by …",
  "as per …", "pulled from …", and "Contact …", and copyright lines
  (`Copyright (c) 2024 <organization>`). Values in scripts without letter
  casing (CJK, Arabic, …) are accepted only in labeled or structured contexts.
  PowerShell parameters such as `-Name "WindowsTerminal"` and Verb-Noun
  values such as `Get-Random` are command syntax and never match. This is
  contextual detection, not universal name recognition: arbitrary free-text
  names and organization-specific terms are NOT guessed, because that would
  require a name dictionary that misses uncommon and international names while
  falsely redacting ordinary words like Mark, Bill, May, Rose, or Main. Use
  **Hide custom terms** (session-only) or a reusable **Cloak List** when a sensitive
  value has no reliable generic structure. Cloak terms are never regex and use
  exact word/phrase boundaries by default. Common apostrophe, dash, and
  horizontal-spacing variants are normalized, and over-length terms are
  skipped whole rather than truncated.
