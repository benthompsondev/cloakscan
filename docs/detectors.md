# Detector behavior and safety

CloakGuard findings are review leads, not verdicts. Pattern matching can miss
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
  `"$alias@example.org"`, CloakGuard replaces only `@example.org`; complete
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
- Strict detects names and organizations in explicit fields, first/last-name
  fields, clear author/contact context, and conservative organization-shaped
  comments. Arbitrary free-text names and organization-specific terms are not
  guessed. Use
  **Hide custom terms** (session-only) or a reusable **Cloak List** when a sensitive
  value has no reliable generic structure. Cloak terms are never regex and use
  exact word/phrase boundaries by default. Common apostrophe, dash, and
  horizontal-spacing variants are normalized, and over-length terms are
  skipped whole rather than truncated.
