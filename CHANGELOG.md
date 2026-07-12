# Changelog

This file tracks the public CloakScan releases. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.5.0] - 2026-07-11

### Added

- **Save, use this list & rescan.** When the Cloak List editor opens from Build Portfolio Cloak List, the primary action now saves the list, enables it in the active configuration, returns to Scan, and rescans the same source in one step, with an aggregate-count confirmation. A built-in profile forks into the session-only Unsaved configuration (built-in presets are never modified); a named profile updates only itself; the Unsaved configuration updates in place. **Save list only** keeps the old behavior. The transition is computed by pure helpers and the rescan uses those computed values directly, so the new configuration always applies on the very first rescan.
- **Compare output modes.** A compact panel after each scan shows the Safe-share and Portfolio-code outputs side by side, generated from the findings the scan already produced — opening or switching never reruns detectors, and only sanitized text is shown (no "before" view, ever). Copy either version, switch the main preview, and see how many lines actually differ.
- **Portfolio Export Kit.** Three files, each generated on click and never stored: `cloakscan-portfolio.ps1` (the Portfolio-code sanitized output, nothing else), `cloakscan-findings-summary.txt` (app version, output mode, and aggregate counts by category/severity/readiness — the builder receives counts only, so no code path can put a value, term, name, or source excerpt in it), and `cloakscan-review-checklist.md` (a fixed manual-review checklist that states plainly that automated scanning is not a guarantee). When readiness still has warnings, exporting requires an explicit **Export anyway** — never presented as a sign-off.

### Changed

- **Clear session** now also covers the v1.5 surfaces: the pending Cloak List seed, the comparison panel, and export confirmations, alongside source text, findings, output, suggestions, dismissals, session terms, and notices. Remembered profiles, Cloak Lists, and preferences are untouched.
- The desktop export command accepts a suggested filename — but only from an exact four-name allowlist (`cloakscan-clean.txt` plus the three kit files). Arbitrary names, other extensions, path separators, traversal, and absolute paths are rejected before the dialog opens; the user still picks the real destination in the native save dialog, and no new filesystem capability was added.

### Safety

- No new storage key and no change to the preference schema: nothing from the comparison or export kit is ever persisted, and mapping terms still need both the global Remember preferences opt-in and the per-list save-terms opt-in. Saving a list through the new flow never flips either opt-in.
- Secrets, credentials, emails, URLs, hosts, IPs, GUIDs, paths, and connection strings stay bracket placeholders in Portfolio-code output and in both comparison panes, locked in by tests.

## [1.4.1] - 2026-07-11

### Fixed

- The **Sanitization readiness** summary now counts every ordinary finding kept as-is, not just high-severity ones. High and medium keeps are warnings, low keeps are informational, and a kept finding of any severity means the summary can no longer say "No open items" while a detected value is still in the output. Review leads stay a separate item and are never double-counted.
- The all-clear wording no longer claims every finding is handled — it now says nothing from the scan is left open, and still reminds you detection can miss things.
- Mapping suggestions stopped guessing **Organization / SourceOrg** for ambiguous person-like terms (Alex Demo, Bea Example). Multi-word terms only get the organization suggestion when they carry an org cue word (Health, Group, Services, ...); project code names suggest ProjectName, street-suffix phrases suggest SourceAddress, and everything else gets a neutral ReviewTerm marked for editing.
- Common field and UI labels (Not Set, Fax, Access Type, Account Type, ...) no longer surface as likely org terms — they are tagged *common term*, sort last, and are excluded from **Select likely terms**. Unknown acronyms and genuinely org-specific terms stay visible.

### Changed

- Public screenshots, the social card, and the README demo GIF now show current CloakScan (the old ones still showed CloakGuard-era UI). The demo GIF moved to `docs/media/cloakscan-demo.gif`; all visual samples stay synthetic.
- Cloak List editor mapping rows now carry a per-term accessible name (`Mapping for <term>`), which the workspace E2E tests use instead of positional lookups.
- Repo docs caught up with reality: PROJECT_SPEC says 49 registered rules, AGENTS.md describes CloakScan and the current launchers, env var, and desktop capability surface.

### Safety

- No behavior change to what persists: mapping terms still only store behind the global preferences opt-in **plus** the per-list save-terms opt-in, now locked in by direct tests. New mapping-precedence tests prove GUIDs, IPs, hostnames, URLs, UNC and file paths, and credential-bearing connection strings always beat a mapped term inside them.

## [1.4.0] - 2026-07-10

### Added

- Added the **Portfolio Review Workspace**: the pieces for turning a private IT automation script into safe, readable portfolio code now work as one flow.
- Added **replacement strategies** to Cloak List mappings: *Code identifiers only* (the old code-safe behavior, still the default), *Genericize everywhere* (replacement in prose and strings too), *Placeholder*, and *Review lead only* (flag matches, rewrite nothing). Lists exported by 1.3 import with their old behavior intact, and 1.4 exports still carry the code-safe flag so 1.3 builds can read them.
- Added a **Sanitization readiness** summary after each scan: high-severity findings kept as-is, unreviewed review leads, suggested terms not yet handled, invalid-code warnings, and a Safe-share vs Portfolio-code comparison. Guidance, not a guarantee — the honest-limits footer stays.
- Added **smart mapping suggestions**: likely terms in the review panel show a suggested generic replacement (SourceSystem, SourceSystemID, ProviderLicenseId, TicketingSystem, ...) based on the term's shape.
- Added **bulk suggestion actions** and a **Build Portfolio Cloak List** flow: select the terms that matter and open the Cloak List editor pre-filled with ready-to-edit mappings.
- Added **Output mode** to Settings → General as a first-class, profile-independent setting (it also stays in the Scan toolbar).
- Added a **script header metadata** review lead: the value after `# Author:`, `# Company:`, `.AUTHOR`, and similar labels in comment headers.
- Added Detection Rules filters for the newer categories (Organization, Code identifiers, Directory / AD, Messaging / Exchange, Workflow) and a review-leads filter chip.
- Suggested terms now sort org-specific candidates first and tag well-known product phrases (Active Directory, Start Date, ...) as *common term* instead of ranking them with real leads.
- Invalid-code warnings now link to the line in the preview and offer a one-click switch to Portfolio-code mode when that is the likely fix.

### Safety

- Source text, findings, matched values, filenames, clipboard content, and sanitized output still never persist. The readiness summary and list seeds are computed in memory from the current session only.
- The desktop capability surface, updater signing key, CSP, preference schema version, and Cloak List file format version are unchanged.

## [1.3.0] - 2026-07-10

### Added

- Added a second output mode. **Safe-share** keeps the existing placeholder behavior; **Portfolio-code** swaps mapped custom terms found inside variable, function, parameter, property, and command names for valid generic identifiers (casing adapted), so sanitized PowerShell still reads as code. Switching modes is instant — no rescan.
- Added **mappings** to Cloak Lists: term → replacement entries with their own category, severity, match behavior, and a code-safe flag.
- Added Cloak List **JSON export and import** so a list (terms, mappings, and options) can move between machines. Exports contain only user-defined rules, the app warns that the rules themselves are organization-specific, and malformed imports fail safely.
- Added **review leads**: detectors for directory attributes, Exchange workflow terms, credential workflow commands, author initials in history blocks, scheduled-job state files, and identity CSV headers. Lead findings start unchecked — they point at lines worth review and never rewrite output. AD group names in membership commands are detected as normal redactable findings.
- Added an **invalid-code panel** that flags placeholders that landed in identifier position (`$[X]`, `function [X]`, `.[X]`, `param($[X])`), without blocking copy or download.
- Added findings grouping for the new categories (Organization, Code identifiers, Directory / AD, Messaging / Exchange, Workflow) and a one-click review-leads filter.

### Safety

- Source text, findings, matched values, filenames, clipboard content, and sanitized output still never persist and cannot appear in a Cloak List export.
- Mapping terms follow the same explicit save opt-in as plain term values; imported lists always start session-only.
- The desktop capability surface, updater signing key, CSP, and scan overlap behavior are unchanged.

## [1.2.0] - 2026-07-07

### Changed

- Renamed the app to CloakScan across the UI, desktop package metadata, docs, and demo links.

### Added

- Added Cloak List `.txt` export and import so reusable exact-match terms can move between machines without copying from the editor by hand.
- Added **New Scan** on the source panel to clear the current text and results while keeping session settings ready for the next paste or file.
- Added internal Active Directory FQDN coverage for server-shaped hosts such as `DC02.ad.contoso.com`.
- Added network port detection in host/IP and labeled-port contexts.
- Added LDAP and LDAPS URL coverage when the host is internal-looking.

### Safety

- The desktop capability surface, updater signing key, CSP, preference schema, and scan overlap behavior are unchanged.
- Cloak List imports stay in memory unless the user saves the list under the existing preference opt-ins.

## [1.1.2] - 2026-07-06

### Added

- Added a narrowly scoped desktop link opener for the CloakScan GitHub repository and live demo.
- Added AWS `ASIA` temporary access-key IDs to the existing AWS credential check.
- Added a short app demo, branded social card, and a reusable press kit.
- Added AppStream metadata to the AppImage as well as the Debian package.

### Fixed

- Fixed project, release, issue, documentation, and demo links that did nothing inside the Windows and Linux webviews.

### Safety

- The opener cannot launch arbitrary websites or local files. Its capability contains only the CloakScan GitHub and GitHub Pages URL prefixes.
- AWS credential detection still requires a distinctive provider prefix and exact access-key length.
- The webview CSP remains unchanged at `connect-src 'none'`.

## [1.1.1] - 2026-07-06

### Added

- Added a complete Debian package description plus richer AppStream details, screenshots, keywords, content rating, developer, and issue links.
- Added package-time validation for the metainfo and desktop entry extracted from the built `.deb`.
- Added a per-suggestion **Dismiss** action that lasts only for the current session.

### Changed

- Filtered a few remaining built-in sample labels such as NIC, DOB, SIN, and AWS from the possible-name review panel.
- Documented the metadata and uninstall limits of Ubuntu App Center for sideloaded Debian packages.

### Safety

- Dismissed suggestions stay in memory only. They are never written to preferences or other storage and return after the session is cleared or the app is reopened.
- Scanning, the v2 preference schema, CSP, desktop capabilities, telemetry, and background-network behavior are unchanged.
- Updater packages are signed for Tauri verification. The Windows installer itself remains unsigned, so verify its published SHA-256 checksum.

## [1.1.0] - 2026-07-06

### Added

- Added Linux x86_64 `.deb` and AppImage packages to the public release.
- Added 16 distinctive provider, webhook, and signed-URL patterns, bringing the API-key detector to 33 patterns.
- Added AppStream metadata so compatible Linux software managers can identify the installed `.deb`.

### Changed

- Filtered common PowerShell colors, keywords, log words, date tokens, and technical acronyms from possible-name suggestions.
- Ranked likely multi-word names and project terms before single words and acronyms while keeping unknown acronyms available for review.
- Made Linux update behavior package-aware: AppImages can self-update, while `.deb` installs link to the release page for a manual package update.

### Fixed

- Added clear Linux updater messages for missing-platform manifests and release-manifest network failures.

### Safety

- New secret checks require a distinctive prefix, webhook shape, or gated URL parameter. CloakScan still does not guess secrets from entropy.
- The Linux package check exposes one Boolean to the UI and never exposes environment values.
- Content storage, preference schema, scanner CSP, telemetry, and background-network behavior are unchanged.
- Updater packages are signed for Tauri verification. The Windows installer itself is unsigned, so verify its published SHA-256 checksum.

## [1.0.1] - 2026-07-05

### Changed

- Replaced the separate IT and PII samples with one synthetic incident that makes the difference between Balanced and Strict easier to see.
- Added Ctrl+Enter and Cmd+Enter as shortcuts for running a scan from the source editor.

### Fixed

- Stopped treating four-part software versions as IP addresses when quotes, brackets, XML delimiters, or similar short separators sit between the version label and value.
- Kept real private, DNS, and public IP addresses redacting in the same contexts as before.

### Safety

- All provider-shaped values in the built-in sample are synthetic and assembled in code so secret scanners do not mistake them for live credentials.
- Scanning, preference storage, CSP, desktop permissions, and click-only updater behavior are unchanged.
- The updater package is signed for Tauri verification. The Windows installer itself is still unsigned and may trigger SmartScreen.

## [1.0.0] - 2026-07-05

### Added

- Added Maximum and Code & secrets built-in profiles.
- Added fixed-prefix checks for common provider tokens, Slack webhooks, Azure account keys, and Basic authorization headers.
- Added MAC address detection plus checksummed or explicitly labeled ABA, ITIN, EIN, DEA, and passport fields.
- Added per-session and per-Cloak-List placeholder labels and formats. The default stays `[CUSTOM_TERM_n]`.
- Added GitHub issue and pull request templates with synthetic-data reminders, plus a project code of conduct.

### Changed

- Stopped treating four-part software versions, longer dotted runs, loopback, unspecified, and broadcast IPv4 values as sensitive addresses.
- Added email-local-part evidence and a few clear byline cues to Strict person-name detection without adding a name dictionary.
- Refreshed the screenshots and public documentation for the first public release.

### Safety

- New personal-data rules require a checksum, an explicit label, or both.
- Preference storage remains v2. New Cloak List format fields are optional, capped, sanitized, and backward-compatible.
- Scanning, storage, CSP, desktop permissions, and click-only updater behavior are unchanged.
- The updater package is signed for Tauri verification. The Windows installer itself is still unsigned and may trigger SmartScreen.

## [0.9.0] - 2026-07-05

### Added

- Added a user-triggered update check to the Windows app. It checks GitHub only after the user clicks the button.
- Added signed update packages so CloakScan can reject an installer with the wrong updater signature.
- Added a new shield icon, matching app icons and favicon, and a two-tone CloakScan wordmark.
- Added a fuller About page with clear privacy notes, project links, and desktop update status.

### Changed

- Kept the scanner webview at `connect-src 'none'`; update traffic runs through Tauri's Rust plugin.
- Reworded the privacy docs to separate click-only GitHub update traffic from scanning, which remains local and upload-free.

### Safety

- There are no launch checks, background polling, analytics, or telemetry.
- Version 0.9.0 must be installed manually. Automatic updates apply to releases after 0.9.0.
- The updater package is signed for Tauri verification, but the Windows installer itself is still unsigned and may trigger SmartScreen.

## [0.8.0] - 2026-07-04

### Added

- Added a browser demo that uses the same client-side scanner as the desktop app.
- Added a short architecture guide and an animated README walkthrough.
- Added a review panel that suggests possible names, company terms, and repeated acronyms after a scan.
- Added one-click session hiding for suggested terms and a direct link to reusable Cloak Lists.

### Changed

- Updated the README with the live demo, architecture notes, and the new review step.

### Safety

- Suggestions never redact text automatically. The user must choose what to hide.
- CloakScan still uses contextual name and organization checks, not a built-in name dictionary.

## [0.7.3] - 2026-07-04

### Changed

- Shortened the Scan-screen detection reminder at the supported desktop width.
- Made the reminder dismissible for the current session without storing a new preference.

## [0.7.2] - 2026-07-04

### Added

- Added a visible reminder that built-in rules can miss context-specific terms.
- Added Cloak List and Custom Pack creation inside the Profile Editor.

### Changed

- Preserved unfinished profile edits while creating and selecting a new list or pack.

## [0.7.1] - 2026-07-04

### Added

- Expanded contextual person and organization checks across CSV, JSON, copyright lines, signatures, workflow labels, honorifics, and clear prose cues.
- Added a draft-based Profile Editor for modes, packs, Cloak Lists, individual rules, and redaction formats.

### Safety

- Kept name and organization findings low-confidence and protected common command syntax and structured file formatting.
- Documented why exact known names belong in Cloak Lists instead of a universal dictionary.

## [0.6.7] - 2026-07-04

### Added

- Added rule editing for saved profiles while keeping built-in profiles read-only.
- Added public synthetic stress files for repeatable manual checks.

### Changed

- Improved email-domain, Windows path, name, organization, and Cloak List matching.
- Made Cloak List terms handle common apostrophe, dash, and spacing variants.

## [0.6.5] - 2026-07-04

### Added

- Published the first Windows release with 34 local rules, Balanced and Strict modes, country packs, custom terms, Cloak Lists, custom labeled-field rules, and redaction formats.
- Added a per-user Windows installer with an offline WebView2 bootstrapper.

### Safety

- Kept scanning local with no backend, account, or telemetry.
- Documented the unsigned-installer warning and the need to review cleaned text before sharing.

[1.2.0]: https://github.com/benthompsondev/cloakscan/compare/v1.1.2...v1.2.0
[1.1.2]: https://github.com/benthompsondev/cloakscan/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/benthompsondev/cloakscan/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/benthompsondev/cloakscan/compare/v1.0.1...v1.1.0
[1.0.1]: https://github.com/benthompsondev/cloakscan/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/benthompsondev/cloakscan/compare/v0.9.0...v1.0.0
[0.9.0]: https://github.com/benthompsondev/cloakscan/compare/v0.8.0...v0.9.0
[0.8.0]: https://github.com/benthompsondev/cloakscan/compare/v0.7.3...v0.8.0
[0.7.3]: https://github.com/benthompsondev/cloakscan/compare/v0.7.2...v0.7.3
[0.7.2]: https://github.com/benthompsondev/cloakscan/compare/v0.7.1...v0.7.2
[0.7.1]: https://github.com/benthompsondev/cloakscan/compare/v0.6.7...v0.7.1
[0.6.7]: https://github.com/benthompsondev/cloakscan/compare/v0.6.5...v0.6.7
[0.6.5]: https://github.com/benthompsondev/cloakscan/releases/tag/v0.6.5
