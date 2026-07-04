# Project Spec: CloakGuard

One short spec before any code. If this page cannot be filled in, the idea goes to `portfolio-lab` as a backlog note instead of becoming a repo.

## Goal

A fully client-side web app that scans pasted or imported text for secrets, credentials, infrastructure details, and personal data, then produces a cleaned copy with stable placeholders — before the text leaves the machine.

## Why

- Problem it solves: pasting logs, scripts, tickets, or prompts into AI tools, GitHub issues, or public posts leaks emails, tokens, internal hostnames, and file paths. This is daily friction in healthcare IT where nothing internal can leave.
- Why Ben: exercises React + TypeScript + Vite + testing discipline, and turns a real privacy habit into a demoable tool.
- Portfolio story in one line: a local-first sanitizer that proves Ben thinks about data safety like an operator, not just a coder.

## Smallest Runnable Version

One scan screen: paste or import text → optionally add custom terms to hide → scan locally → review findings with toggles → copy or download cleaned output.

- Input: pasted/edited text, an imported text/code file, or the built-in synthetic demo
- Output: sanitized text with placeholders like `[EMAIL_1]`, plus a findings list
- One command to run it on Windows: `.\Start-CloakGuard.ps1`

## Done Means

- [x] Paste, load demo, scan, toggle findings, copy cleaned text, clear session
- [x] Import UTF-8/UTF-16 text and PowerShell files; download cleaned output
- [x] Session-only custom terms to hide are cleared on refresh or Clear session
- [x] Repeated identical values share one placeholder; overlaps resolve to the more specific finding
- [x] Thirty-four registered detectors cover common secrets, identity, path, network, directory, PowerShell, and (pack-only) regional PII shapes
- [x] README explains what/why/run/verify
- [x] `npm run verify` (audit + lint + unit tests + build + desktop e2e) passes

## Scope Boundaries

- In scope: the desktop scan screen, Settings (profiles & packs with a draft-based Profile Editor, Cloak Lists, rule controls, redaction formats, privacy), Privacy/About page, hash navigation, file import/download, session-only custom terms to hide, 34 registered detectors (23 Balanced + 7 Strict-only + 4 pack-only regional), built-in country packs, custom packs with labeled-field rules, opt-in preference storage, production launchers, unit/e2e tests, CI, and docs.
- In scope since v0.6.1: a Windows-only Tauri 2 desktop shell (`src-tauri/`, see `docs/desktop.md`) that bundles the same static frontend with one save-dialog command and one matching capability, nothing else.
- In scope for v0.6.5: public source repository, Windows setup release, checksum, and the `CloakGuard Project` installer publisher label.
- Out of scope (be ruthless): scan history (privacy decision; see SECURITY.md), user-editable regex rules, rule import/export, mobile-specific UI, dark/light toggle, PWA packaging, macOS/Linux desktop builds, code signing, auto-update, backend anything, browser extension, i18n.
- Ask Ben first before: publishing to GitHub, adding dependencies, persisting anything beyond the allowlisted preferences key.

## Verification Plan

- Command: `npm run verify`
- Expected result: audit clean, ESLint clean, all Vitest suites pass, production build succeeds, and all Playwright desktop tests pass.
- Manual: run the production launcher, click **Load sample** → **Scan locally**, confirm findings and cleaned output; refresh clears everything.

## Privacy Check

- [x] No work-derived data, names, hostnames, or identifiers copied into the repository
- [x] Uses fake/mock/demo data only (`src/lib/demo.ts` is clearly synthetic)
- [x] Authorized private corpus testing is read-only and reports aggregate counts only
- [x] Safe to publish after review, but not pushed yet

## Decisions Log

| Date | Decision | Why |
| --- | --- | --- |
| 2026-07-01 | Memory-only state, no storage APIs at all | Strongest possible privacy guarantee, easy to reason about |
| 2026-07-01 | One small regex module per detector, priority-based overlap resolution | Readable, testable, extensible; avoids one giant regex blob |
| 2026-07-01 | Placeholders keyed by label + exact value | Repeated values stay consistent in the output |
| 2026-07-01 | Only the core scan screen in v0 | History/settings screens from the concept art are later slices |
| 2026-07-01 | v0.2: desktop polish pass — highlighted panels, grouped finding cards, file import/download, launch scripts, strict production CSP, Playwright e2e, CI | Make the existing slice presentable and easy to run before adding new screens |
| 2026-07-01 | Tooling upgraded to Vite 8 / Vitest 4 / ESLint 10 / TS 6 | Clears all npm audit findings; behavior verified by the full test suite |
| 2026-07-01 | Findings displayed grouped by detector + value with bulk toggle | Matches the reference design; per-occurrence data model unchanged underneath |
| 2026-07-01 | v0.3: PowerShell/admin detector pass driven by an authorized private corpus (aggregate counts only) | Real scripts revealed misses: UNC paths, AD DNs, compound password vars, SecureString literals, GUIDs, param literals, tenant domains |
| 2026-07-01 | Session-only private terms (renamed Quick Cloak in v0.6.3, then "Hide custom terms" in v0.6.4; literal, case-insensitive, [CUSTOM_TERM_n]) | Org names and public-suffix internal domains are structurally undetectable by generic rules |
| 2026-07-01 | Launchers now build + serve production on 127.0.0.1:4173; deps checked via package-lock hash | Normal users get the CSP-protected build; `npm run dev` stays a developer command |
| 2026-07-01 | File import decodes UTF-16LE/BE + BOM variants | PowerShell tooling writes UTF-16; UTF-8-only decoding broke the primary use case |
| 2026-07-01 | Protect common PowerShell regex literals before detection; auto-replace only quoted secret literals; narrow account and ticket contexts | Preserve executable syntax while still surfacing review-worthy sensitive values |
| 2026-07-02 | v0.4: app shell with hash navigation (Scan / Settings / Privacy-About), no routing dependency | Three views do not justify a router package |
| 2026-07-02 | Detection profiles: Balanced (default, preserves prior behavior), Strict (labeled person/org name rules only), Custom (derived from per-rule toggles) | Strict adds defensible context-based checks, never free-text name guessing |
| 2026-07-02 | Scan engine takes enabled detector ids + placeholder template as per-scan options | Configuration without mutating detector definitions |
| 2026-07-02 | Redaction formats as validated {TYPE}/{INDEX} templates | Safe by construction — no token exists for the original value |
| 2026-07-02 | Preference storage opt-in (OFF default), one allowlisted versioned key, never content | Keeps the memory-only content guarantee while letting settings survive reloads |
| 2026-07-02 | No persisted scan history | Sanitized output may still contain missed sensitive values; auto-saving would weaken the privacy model |
| 2026-07-02 | v0.5: strict detectors are hard same-line ([ \t] only) — fixed org-name absorbing the next field across a newline | Labeled-field rules must never eat neighboring lines |
| 2026-07-02 | v0.5 coverage: private-key blocks, credential connection strings, Luhn+IIN payment cards (Balanced); labeled phone/address/DOB/SIN/health-id (Strict) | All checksummed/labeled — no free-text PII guessing |
| 2026-07-02 | Canadian SIN accepted only when labeled or conventionally grouped, checksum-valid, and in an issued range | Bare 9-digit runs are overwhelmingly not SINs |
| 2026-07-02 | Corpus harness reports Balanced and Strict aggregates side by side | Measures what Strict adds without exposing any content |
| 2026-07-02 | v0.6: country packs (CA/US/EU) as data-driven bundles of pack-only, checksummed regional detectors | Regional coverage without bloating the Core modes; packs only enable rules |
| 2026-07-02 | Resolution order: Core → built-in packs → custom packs → overrides → custom rules → cloak terms | Deterministic layering; a rule enabled twice runs once |
| 2026-07-02 | Named profiles own the redaction format | Multiple active packs cannot safely own conflicting output formats |
| 2026-07-02 | Custom rules = labeled-field only (digits/identifier/text), no user regex, code-shaped values skipped | Safe by construction, previewable before saving |
| 2026-07-02 | Storage v2 with v1 migration; term values persist only behind a separate per-pack opt-in with an unencrypted-data warning | Narrow, versioned, allowlist-only persistence |
| 2026-07-02 | Packs ship a visible non-compliance disclaimer | Coverage help, never a legal claim |
| 2026-07-02 | v0.6.1: over-limit custom-rule values are skipped whole, never truncated | A partially redacted value leaves a sensitive remainder in output that looks clean |
| 2026-07-02 | v0.6.1: quoted custom-rule values redact only the content inside matching quotes | Preserves surrounding structure; unclosed quotes stop at end of line |
| 2026-07-02 | v0.6.1: IBAN matching accepts any letter case; normalization is validation-only | Real-world pastes are often lowercased; findings keep the original characters |
| 2026-07-02 | v0.6.1: Windows desktop shell via Tauri 2 — bundled assets, core:default only, NSIS per-user installer with offline WebView2 | Same privacy model as the browser build; packaging, not a rewrite |
| 2026-07-02 | v0.6.1: desktop save uses one app command (native save dialog + write to the picked path) | WebView2 silently drops blob-anchor downloads; this is the narrowest possible replacement |
| 2026-07-03 | v0.6.2: IPC locked to a build-time command ACL + allow-export-clean-text only; core:default removed; withGlobalTauri off; @tauri-apps/api invoke/isTauri | Smallest possible frontend surface, enforced by a config unit test |
| 2026-07-03 | v0.6.2: privacy wording says "on this device"; app requests distinguished from WebView2 platform networking; uninstall docs match the NSIS delete-app-data checkbox | Exact claims only — never promise the whole process tree is silent |
| 2026-07-03 | v0.6.2: single user-facing artifact release/windows/CloakGuard-Setup-<version>-x64.exe (NSIS, per-user, offline); bare exe documented as developer-only | Everyday users get one download with no prerequisites |
| 2026-07-03 | v0.6.3: "Quick Cloak" (session-only, badged never-saved) and "Cloak Lists" (term-only CustomPacks via isCloakList — no new schema) | Exact-term cloaking becomes a first-class, discoverable feature with temporary vs reusable made explicit |
| 2026-07-03 | v0.6.3: over-length terms skipped whole with line numbers; 100-term cap reported, never silently partial; exact words/phrases as matching default | A truncated or silently dropped term cloaks something different from what the user typed |
| 2026-07-03 | v0.6.3 correction: finished the visible Quick Cloak / Cloak List terminology sweep, reworded the local-save opt-ins, and blocked ambiguous empty creations (new Cloak List needs ≥1 valid term; Custom Pack needs ≥1 detector or rule) | Review found leftover "Private Terms" wording and save buttons that allowed collections with nothing to detect |
| 2026-07-03 | v0.6.4: renamed the session-only action to "Hide custom terms" and its dialog to "Custom terms to hide"; reusable collections remain "Cloak Lists" | The previous "Quick Cloak" name described speed rather than what the control actually does |
| 2026-07-04 | v0.6.5: first public release; Windows publisher set to "CloakGuard Project", public repository metadata added, and CI expanded to verify the desktop shell on Windows | Give users a clear package identity and publish a reproducible source release without implying code signing |
| 2026-07-04 | v0.6.6 hardening: detect bare mail-domain suffixes and labeled domains, redact spaced Windows paths as a whole, broaden Strict name/organization context, and normalize common Cloak List punctuation variants | A private PowerShell stress test exposed partial path redaction and missed identity/domain shapes |
| 2026-07-04 | v0.6.7: saved profiles have an explicit Edit rules flow and a clear editing-state banner | Named profiles were already editable in place, but the old UI made that behavior hard to discover |
| 2026-07-04 | v0.7: one draft-based Profile Editor per saved profile (name, description, base mode, packs, Cloak Lists, rules, format) replacing the Edit rules action; Save is the only commit point and scan results invalidate only when scanning behavior actually changed | Live-applying edits across four settings pages made it too easy to change the wrong profile or not notice a change had already taken effect |
| 2026-07-04 | v0.7.1: contextual name/org hardening (JSON keys, CSV columns, copyright lines, prose cues, honorifics, signatures, headers, strong-suffix free text) with NO runtime name dictionary; both rules dropped to low confidence with an in-app note linking to Cloak Lists | Real pastes showed misses; a dictionary would miss international names while redacting ordinary words — honesty plus Cloak Lists beats false certainty |
| 2026-07-04 | v0.7.2: put the detector-limit reminder on the Scan screen and allow Cloak List/Custom Pack creation inside the Profile Editor while preserving its draft | The warning belongs where users scan, and profile setup should not require abandoning unsaved edits |
| 2026-07-04 | v0.7.3: shorten the Scan reminder and make it dismissible for the current session only | Keep the warning visible for first use without permanently taking space from the scan workflow |
