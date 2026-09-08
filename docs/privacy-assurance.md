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

## Seeded fuzzing and installer boundary follow-up

Starting commit: `21114af`. This pass adds a dependency-free xorshift32 grammar
generator in `src/test-fixtures/privacyFuzz.ts`. Twelve fixed nonzero seeds
generate 1,440 field cases, 144 literal-syntax cases and 480 benign controls.
Failures print their seed, case number and original synthetic representation.
Reproduce with `npx vitest run src/lib/privacyFuzz.test.ts`; add a seed to
`FUZZ_SEEDS` to extend the same bounded grammar.

The grammar combines casing, nested config, fullwidth ASCII, Unicode spacing,
zero-width space/BOM insertion and JSON escapes. Separate seeded literal forms
exercise CRLF/LF, multiline quotes, PowerShell here strings, YAML blocks, POSIX
apostrophe concatenation and percent-encoded connection-string passwords.
It does not evaluate expressions or decode arbitrary blobs. Tests check every
character of the sensitive representation is covered, original UTF-16 offsets
remain correct, both output modes omit the source value, and preview segments
equal clean output. Benign controls must remain byte-for-byte unchanged.

The initial sensitive run failed 1,072 of 1,440 cases. Two root causes explained
these generated failures: U+200B/U+FEFF could break recognizable labels or values,
and fullwidth quotes were normalized after quote tracking, preventing JSON
escapes inside them from being decoded. Five minimized sensitive fixtures were
added before fixing those paths. Detection now ignores those two copy/paste
invisibles and normalizes fullwidth syntax before processing escapes. It does
not remove joiners or bidi controls with language semantics.

Benign fuzzing also reproduced a public URL being truncated at a BOM into a
single-label internal hostname. A sixth minimized regression covers that case.
The URL matcher now retains BOMs long enough to classify the full normalized
hostname. The raw source is still preserved for output. Quoted endpoint/server
assignments remain intentionally within the existing infrastructure scope,
including organization-specific public domains; benign controls respect that
contract rather than weakening it.

### Native security configuration inspection

- Production CSP comes from `vite.config.ts` and is embedded in the static HTML.
  Tauri's null CSP prevents a replacement policy, rather than disabling the
  built policy. It restricts scripts/styles to self, forbids web connections,
  forms, objects and base changes, and defaults other resource types to none.
  The Rust updater uses its own network path, outside web `connect-src`.
- `capabilities/main.json` grants the local main window two app commands,
  updater commands, restart and project-scoped external links. It grants no
  general filesystem, shell, HTTP, clipboard, window or devtools commands.
  `build.rs` generates the app-command allowlist. Import uses the browser File
  API for the user-selected file; export asks for a destination in a native
  dialog and accepts only four suggested filenames. The destination itself is
  user-selected, so it is not a fixed output-directory sandbox.
- Updates are user-triggered and use the configured HTTPS GitHub endpoint and
  public verification key. Version checks reject equal/older versions in the
  frontend. Tauri verifies the downloaded artifact, not the JSON release notes.
  Installer packages currently allow a deliberate manual downgrade; that is
  separate from the app's update selection.
- NSIS is current-user and bundles the offline WebView2 installer. Its generated
  uninstall script removes the application and registration; app-data deletion
  is a separate checkbox. Explicitly saved terms can therefore outlive a normal
  uninstall. Clearing preferences is not secure erasure of WebView2/OS caches,
  filesystem history, clipboard history or backups.

These are source/configuration findings backed by the existing configuration
and updater tests. They are not proof of arbitrary IPC rejection or a malicious
signed-update simulation in the installed process.

### Packaged Windows storage failure

The initial NSIS installation exposed a native-only failure despite the source
textarea already having `autocomplete="off"`. After importing/scanning a
synthetic UTF-16 file and restarting, the React UI correctly opened empty and
remembered only Maximum. However, the test product's WebView2 SQLite database
`EBWebView/Default/Web Data`, table `autofill_edge_field_values`, held a source
value containing the unique test credential. The preference JSON held only
settings. Checking just the restarted UI would have missed this disclosure.

The native window configurations now set `generalAutofillEnabled: false`, which
Tauri/Wry forwards to WebView2's `SetIsGeneralAutofillEnabled`. The installed
Tauri schema explicitly warns that WebView2 Suggestions can ignore HTML
autocomplete attributes. A failing configuration regression was added before
the fix, covering the shared and merged Windows window settings.

This prevents that collection path; it is not retroactive secure erasure. The
initial test uninstall exited zero, removed the executable and its HKCU product
registration, and retained the WebView2 profile. Historical cached text may
therefore remain for users of older versions even after an upgrade or ordinary
uninstall. Close CloakScan and use the uninstaller's app-data deletion option
to remove its profile if needed, after preserving any intentionally saved
profiles/lists. Clear preferences only clears CloakScan's preference keys.
OS clipboard history, file-picker history, backups and disk recovery remain
outside that action's guarantee.

The installer test used `CloakScan Assurance` with identifier
`dev.benthompson.cloakscan.assurance`, installed under ignored
`.cloakscan/installed`, leaving the real installed product untouched. The only
build overrides were product name, identifier and `createUpdaterArtifacts:
false`; the last avoids generating a signed update package for a local test.
This is an actual NSIS package and installation, but not a release-signing or
production-identity upgrade test. WebView2 was already installed, so the bundled
offline runtime bootstrap on a machine without WebView2 remains untested.

### Fixed package runtime proof, September 8, 2026

Rebuilt the NSIS installer after disabling native autofill, reinstalled it into
the same isolated destination and reused the profile containing the historical
positive-control row. The installer exited zero. Final test artifacts:

- Installer SHA-256:
  `FBEE8EF38D42DF6ADA8051140E0F32EF2A946B80AD9780D730148386E0987F18`
- Installed executable SHA-256:
  `76A9E2671E2585EEA9C8402B72C4592222FDEE85C6902FC382FA54D0A817E05D`

The installed Paste button opened the WebView2 permission prompt. Keyboard Tab
navigation reached Allow, and Enter completed the synthetic paste. The same
button worked again after restart. This closes the earlier successful-button
automation gap; clipboard denial and OS policy variations were not retested.

With remembered preferences on, pasted and scanned a fresh unique credential,
MRN and DOB. All became placeholders. After closing the process, queried the
actual SQLite `autofill_edge_field_values` table: the historical credential
still had one row, while the new credential had zero. A byte search across the
test WebView2 profile also found zero files with the new source markers. Restart
retained Maximum but opened empty source and preview. Then cleared preferences,
confirmed storage OFF, pasted/scanned a different unique credential, closed
again, and repeated the database and byte checks: zero new marker hits, with
the historical positive control still present. These are bounded plaintext
storage checks, not a forensic proof against every OS/browser storage mechanism.

The installed app's explicit **Check for updates** completed and reported
v1.5.7 as current. No update was downloaded or installed. Signature rejection,
an actual newer-version replacement and release signing remain separate gaps.
The local assurance installer is not Authenticode-signed.

Finally ran the real NSIS uninstall UI with **Delete the application data**
selected. It reported success; filesystem and registry checks confirmed the
test executable, HKCU product registration and test WebView2 profile were gone.
The original CloakScan installation remained present and was not upgraded.
Default uninstall had previously retained the profile, proving both behaviors.

To repeat the storage check, build using the Windows overlay plus a local JSON
overlay with the isolated product name/identifier and updater artifacts off.
Install into a fresh test directory with NSIS `/S /D=<absolute-test-directory>`.
Use a unique synthetic marker with preferences both on and off; close the app
before opening the test profile's `Web Data` database read-only. Query
`SELECT count(*) FROM autofill_edge_field_values WHERE instr(value, ?) > 0`
with that marker, and compare against a pre-fix positive control. Never use the
real product's profile or scan its database as test evidence. Test artifacts
and raw runtime output stay outside Git.

Final checks passed: 2,070 seeded/regression tests within 3,721 total tests,
lint, production build, 98 browser tests (10 opt-in screenshot tests skipped),
and desktop build/Cargo check/nine Rust tests. `e2e/privacyFuzz.spec.ts` exercises
the minimized detector regressions in both real browser output modes.

Remaining runtime limits: per-list sensitive-term opt-ins still have browser
and unit coverage rather than every native combination. IPC permissions and
updater configuration were inspected and their existing tests passed; actual
malicious IPC or signed-update tampering was not injected into the installed app.
No cold-machine WebView2
bootstrap, production-identity upgrade, Linux package or OS-policy matrix was
run. Arbitrary encodings, unknown identifiers, constructed runtime secrets,
mixed-script obfuscation and unlabeled clinical prose still require human review.
