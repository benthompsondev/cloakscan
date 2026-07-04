# CloakGuard

[![CI](https://github.com/benthompsondev/cloakguard/actions/workflows/ci.yml/badge.svg)](https://github.com/benthompsondev/cloakguard/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/benthompsondev/cloakguard)](https://github.com/benthompsondev/cloakguard/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

CloakGuard is a local-first app for cleaning code, logs, prompts, support tickets, and draft posts before sharing them with AI tools, GitHub issues, or anyone outside your network. Everything runs on your device. There is no backend, account, telemetry, or upload.

I built it because I was tired of manually checking every log and script for hostnames, usernames, paths, and other details before sharing them. The useful part is simple: paste text, review what it finds, and copy a cleaned version.

![CloakGuard scan screen](docs/screenshots/scan-desktop-1440x900.png)

## Download for Windows

Download the latest setup executable from [GitHub Releases](https://github.com/benthompsondev/cloakguard/releases/latest). It installs for the current Windows user and does not require Node, Rust, administrator rights, or an internet connection.

The installer is currently unsigned, so Windows SmartScreen may show a warning. Verify the SHA-256 value published with the release before running it.

## Run from source

**Windows** - from this folder in PowerShell:

```powershell
.\Start-CloakGuard.ps1
```

**macOS / Linux** - from this folder in a terminal:

```bash
./start-cloakguard.sh
```

Both scripts check that a supported Node.js is installed: **Node 20.19+ or 22.12+**. They never install Node for you or need admin/root. They run `npm ci` only when dependencies are missing or out of sync with `package-lock.json`, then build the production app with its strict Content Security Policy and serve it on `127.0.0.1`.

**To stop the app:** press `Ctrl+C` in the terminal window where it is running.

**Windows desktop app** - CloakGuard ships as one setup executable: `CloakGuard-Setup-0.6.7-x64.exe`. It bundles the WebView2 runtime installer so installation works offline. The setup EXE is the only artifact most users need. Developers can build it with `npm run desktop:build`; details are in [docs/desktop.md](docs/desktop.md).

**Developer setup** (`npm run dev` is the development path, with hot reload and no CSP):

```powershell
npm ci            # install dependencies
npm run dev       # dev server (development only)
npm run check     # lint + unit tests + typecheck + build
npm run test:e2e  # Playwright desktop tests (first: npx playwright install chromium)
npm run verify    # audit + lint + unit tests + build + e2e, all in one
```

## What it does

1. Paste text, import a text/log/code/config file (read in memory, max 2 MB; UTF-8 and UTF-16 PowerShell files both decode correctly), or load a built-in synthetic sample: **Load sample** for an IT/admin log or **PII sample** for personal data.
2. Click **Scan locally**. CloakGuard has 34 focused detectors covering common secrets, credentials, network details, file paths, cloud identifiers, personal data, and regional formats. Balanced handles the common cases. Strict adds labeled personal information. Country packs add validated Canadian, US, and EU formats. See [Detector behavior and safety](docs/detectors.md) for the full list and known limits.
3. Use **Hide custom terms** for exact names, domains, hostnames, project names, or other values the built-in rules cannot know. These terms last for the current session only. For reusable terms, create a **Cloak List** under Settings > Profiles & Packs.
4. Review the findings. Each one shows its category, severity, a masked preview, and the replacement placeholder. Toggle off anything you want to keep.
5. Copy the cleaned output or download it as a `.txt` file. Formatting is preserved, and repeated values reuse the same placeholder.

## Settings

The **Settings** view (in-app navigation, no page reloads) controls detection without touching any code:

- **General** - Choose Balanced or Strict detection and control the opt-in preference storage.
- **Profiles & Packs** - Build reusable profiles from country packs, Cloak Lists, custom labeled-field rules, and a redaction format. Each saved profile has an **Edit profile** action that opens a single editor for everything the profile does: name, optional description, Balanced/Strict base mode, country packs, Custom Packs and Cloak Lists, every detection rule (with search, filters, and live enabled/override counts), and the redaction format with a synthetic preview. Edits work on a draft — nothing applies until Save, Cancel discards everything, and the built-in Balanced and Strict presets stay read-only.
- **Detection Rules** - Search the detector registry, review false-positive guidance, and enable or disable individual rules.
- **Redaction Formats** - Use indexed labels (`[EMAIL_1]`), unnumbered labels (`[EMAIL]`), a uniform `[REDACTED]` value, or a safe template using `{TYPE}` and `{INDEX}`.
- **Privacy** - Review storage status and clear saved preferences.

**Preference storage is opt-in and narrow.** By default, named profiles, custom packs, Cloak Lists, custom rules, and terms vanish on reload. If you enable "Remember preferences", one allowlisted localStorage key stores the configuration, never source text, filenames, findings, matched values, output, or clipboard data. Cloak List terms need a second per-list opt-in before they are saved. Those saved values are plain, unencrypted local data. Terms entered through **Hide custom terms** never persist.

**Why no scan history:** sanitized output can still contain a value the detectors missed, so automatically saving results would weaken the privacy model. Scans are deliberately never persisted.

Detector findings are review leads, not verdicts. CloakGuard protects common
PowerShell regex pattern strings, leaves generated password expressions
untouched, and deliberately avoids guessing that arbitrary AD arguments are
usernames. See [Detector behavior and safety](docs/detectors.md) for the exact
replacement rules and remaining boundaries.

## Verify it works

Run `npm run check`. Lint, unit tests, typecheck, and build should all pass. `npm run test:e2e` runs Playwright against the production build, including a check that the app contacts no non-local origin.

## Privacy model

- All scanning happens locally. CloakGuard makes no remote application requests, telemetry, or analytics calls. The production launcher binds to `127.0.0.1`.
- Content is never persisted. Refresh or **Clear session** wipes source text, findings, output, and session-only custom terms. The only optional storage is the narrow preference configuration described above.
- Imported files are read with the browser File API and never uploaded. Downloads are generated in memory.
- Detected values are masked in the UI and never logged. The production build also has a strict Content Security Policy that blocks outbound browser connection APIs.
- **Automated detection can miss sensitive information. Review before sharing.** This is a helper, not a guarantee. See [SECURITY.md](SECURITY.md).

## Project status

v0.7.1 is a big detection pass for names and organizations, plus a proper Profile Editor. It started with real pastes that slipped through: names in CSV exports, "as per …" and "Contact …" notes in tickets, and a copyright line naming an organization. What changed since v0.6.7:

- **Names and organizations get found in far more places.** Quoted JSON keys (`"displayName"`, `"companyName"`), CSV files with recognized columns like FirstName or Department (quotes and commas preserved exactly), copyright lines, prose cues ("prepared by", "as per", "pulled from", "Contact …", "escalated to", "spoke with"), honorifics (`Dr. Alex Demo`), email signatures ("Regards," then a name), To/From/CC headers, workflow labels (AssignedTo, Requester, Attn, Technician, Patient), suffixes and particles (Jr., II, van der, al), and free-text organizations with strong suffixes (Hospital, Healthcare, Ltd, Inc, University, Clinic).
- **Both name rules are now low confidence, and honest about it.** Detection is contextual — there is no built-in name dictionary, because one would miss uncommon and international names while falsely redacting ordinary words like Mark, Bill, May, or Rose. The rule detail panel now says this in the app and links straight to Cloak Lists for anything CloakGuard misses.
- **Command syntax stays safe.** `Get-Process -Name "WindowsTerminal"`, `Name = Get-Random`, and parameter lines never become findings; JSON keys and CSV structure come back byte-for-byte.
- **Profile Editor.** Each saved profile now opens in one editor covering name, description, base mode, packs, Cloak Lists, all 34 detection rules, and the redaction format. Everything edits a draft — nothing applies until Save, Cancel discards it all, and built-in presets stay read-only.
- There is now a proper test matrix behind the name rules — 60+ positive person cases, 40+ positive organization cases, and 60+ cases that must never match — plus a fifth public stress file covering PowerShell, JSON, CSV, logs, and prose.

This is still a detection helper, not a guarantee or compliance product. Scan history, arbitrary user regex, automatic updates, and code signing are deliberately not included yet.

## Contributing

Issues and pull requests are welcome. Use synthetic examples only and read [CONTRIBUTING.md](CONTRIBUTING.md) before sharing a detector sample.

Five synthetic files under [examples/stress-tests](examples/stress-tests) are available for longer manual checks covering PowerShell, support logs, mixed configuration, custom organization terms, and name/organization detection.

## License

MIT. See [LICENSE](LICENSE).
