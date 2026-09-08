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

## Mutation and Windows runtime follow-up

This follow-up started at `2a4431c`. It did not repeat the broad audit above.
The new deterministic matrix initially failed 149 cases: Unicode whitespace
around labeled credentials and health/PII fields accounted for 144; the other
five were a POSIX escaped apostrophe, an escaped JSON key, a fullwidth label,
an internal URL containing parentheses, and a JSON-escaped internal URL.
Some failures exposed an entire value; others left a significant tail visible.

Detection now supplements the original scan with a narrowly normalized view:
common Unicode spaces, fullwidth ASCII, JSON escaped slashes and unreserved
ASCII Unicode escapes. Every match maps back to the original UTF-16 offsets.
The output still uses the original source and existing overlap handling.
Shell apostrophe concatenation is captured as one credential; internal URL
paths retain balanced parentheses inside their redaction span.

`src/test-fixtures/privacyMutations.ts` supplies 360 field combinations,
26 boundary cases and 27 benign controls. `src/lib/privacyMutations.test.ts`
also runs the previous 79 sensitive fixtures with CRLF, a Unicode space and
a surrogate-pair prefix. These 492 tests check complete span coverage, original
offsets, deterministic scans, both output modes and preview/output agreement.
Controls preserve variable references, metadata fields, regex examples, public
URLs and ordinary technical or clinical prose. This is a bounded deterministic
property matrix, not random fuzzing or a measured real-world detection rate.
The browser mutation test scans 48 representative variants separately in both
output modes. A separate browser test covers default-profile safety.

### Default-profile safety

Balanced enables 33 of 49 rules. A native scan of a password, labeled DOB and MRN
removed the password while leaving the health identifiers visible. Safe-share
does not enable omitted detectors. The existing general reminder did not make
that configuration gap explicit.

The scan page now always shows a coverage warning when built-in personal-data
or secret rules are disabled. It explains the output-mode distinction and
offers **Enable all built-in rules**. That selects Maximum with its packs,
invalidates the old preview and requires a rescan. Readiness also stays open
for omitted coverage, including the existing Export Kit review reminder.
Profiles remain user-controlled; this does not silently turn on broad rules or
claim that Maximum catches everything.

### Windows evidence

Built and launched `src-tauri/target/release/cloakscan.exe` with
`npm run tauri -- build --no-bundle`. This was the production Tauri executable
with bundled frontend assets, using an isolated WebView2 profile under the
ignored `.cloakscan/` directory. It was not a development browser or mocked IPC.
The installed copy was left unchanged. Tested executable SHA-256:
`F224F06738CBA4222EE2C03F77C1C8F7F7368AC20D07DA9EBDB78B359F7E17F5`.

Native UI automation exercised keyboard paste from the Windows clipboard,
Balanced scanning, the coverage warning, Maximum/all-pack selection, stale
preview invalidation, rescanning, both output modes, Copy clean text and the
real Save As dialog. The synthetic input included NBSP after DOB, a thin space
after MRN, a password, and an internal URL ending in `report(final)`.
All four sensitive values disappeared after the Maximum scan. Clipboard text
matched the expected preview after Windows newline normalization; the saved
UTF-8 bytes matched the expected output exactly. Cancelling a second save
returned to the app. Rust tests separately cover exact CRLF/Unicode writes,
complete overwrite, empty output, missing directories and filename allowlisting.
Closing and reopening the executable with the same isolated profile and
persistence off restored an empty source/preview, Balanced, Safe-share and the
coverage warning. No prior source value appeared in the restarted UI.

The Paste button opened WebView2's clipboard-read permission prompt. Automation
could not reliably target that child popup, so successful permission approval
and button paste remain unverified; Ctrl+V worked after dismissing it. This pass
did not exercise the NSIS installer, updates, Linux runtime, native file import,
or every native settings/remember-state combination. Browser import, settings
and storage tests remain separate evidence.

Final gates: `npm run check` passed lint, 1,650 tests and production build;
`npm run test:e2e -- --workers=4` passed 97 tests with 10 opt-in screenshot tests
skipped. The four focused browser tests passed again after strengthening their
mode reset. `npm run desktop:verify` passed build, Cargo check and all nine Rust
tests. The release executable build also passed.

Remaining detection limits include arbitrary encoding, invisible character
insertion, mixed-script homoglyphs, language-level string construction, unlabeled
patient data, free-form clinical narratives and confidential services on public
domains. The normalization pass is not a general JSON/shell parser or Unicode
deobfuscator. Use custom terms and human review for these cases, even in Maximum.
No service, dependency, telemetry or persistence mechanism was added.
