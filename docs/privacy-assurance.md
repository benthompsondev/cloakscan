# Focused sanitization assurance, September 7, 2026

The starting checkout was `b7efc70` on `main`, with a clean working tree and
1,064 passing tests. The older quoted-only secret-assignment finding did not
reproduce: unquoted env, YAML, JSON, CLI and XML coverage was already present.

The new synthetic fixtures reproduced these gaps through `scanText` and
`buildCleanText`:

- Multiline quoted secrets, Python triple quotes, PowerShell here strings,
  multiline XML and YAML block markers with comments could leave secret bodies
  or later lines visible. JSON dollar expressions were mistaken for references.
- Mixed-case Bearer schemes, short explicit credentials and JSON Basic headers
  could be missed. Header names and JSON quotes now survive replacement.
- A higher-priority token could defeat an overlapping internal URL finding,
  leaving confidential host/path data visible. Redactable overlaps now cover
  their combined span across categories; review leads remain separate.
- PowerShell regex protection could suppress a real provider credential or an
  enclosing private-key block. Recognizable secrets now survive that filter;
  regex syntax such as `password=\w+` remains intact.
- Long CLI credentials, long addresses, long MRNs and legal provider-key suffix
  punctuation could be only partly cloaked. Captures now include their tails.
- Health identifiers missed quoted JSON keys, common label separators, grouped
  numbers, version codes, NHS Number and OHIP labels. Labeled phone, address,
  birth-date and SIN rules also gained JSON-key and case support.

The shared fixture file is `src/test-fixtures/privacyAssurance.ts`. Its 79
sensitive cases and 14 benign controls run through the real scan/output path.
The tests verify every character of each marked sensitive span is covered,
not merely that the complete original string disappeared. Both output modes
are checked. Provider fixtures reuse the existing synthetic provider corpus.

`e2e/privacyAssurance.spec.ts` scans each sensitive fixture separately in the
production browser UI, checks both output modes, checks benign text, and compares
preview, copied text and downloaded text. Windows clipboard CRLF normalization
is accounted for. The existing suite also checks local-only traffic, storage
opt-ins, rule selection, finding toggles, import/export and session clearing.

Validation after the changes:

- `npm run check`: lint, 1,157 tests across 45 files, TypeScript and Vite build passed.
- `npm run test:e2e -- --workers=4`: 93 passed; 10 opt-in documentation screenshot
  capture tests skipped. The new assurance test captured its own screenshot.
- `npm audit`: zero reported vulnerabilities.
- `git diff --check`: passed.

No native Tauri GUI or platform packaging check was performed. The browser
tests exercise the shared frontend sanitization implementation. No remote
service, dependency or persistence mechanism was added.

This is bounded regression evidence, not a detection-rate estimate or a
de-identification certificate. Health identifiers remain enabled through
Strict, Maximum or the Canada/US packs. Clinical narratives and table exports,
unlabeled or encoded secrets, incomplete key blocks, unfamiliar identifiers,
non-Latin text and confidential public-domain services still require human
review. The UI and detector documentation state these limits.
