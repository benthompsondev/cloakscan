# CloakScan

[▶ Try the live demo](https://benthompsondev.github.io/cloakscan/) — runs entirely in your browser, nothing is uploaded. Or [download the desktop app](https://github.com/benthompsondev/cloakscan/releases/latest) for offline use on Windows or Linux.

[![CI](https://github.com/benthompsondev/cloakscan/actions/workflows/ci.yml/badge.svg)](https://github.com/benthompsondev/cloakscan/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/benthompsondev/cloakscan)](https://github.com/benthompsondev/cloakscan/releases/latest)
[![Downloads](https://img.shields.io/github/downloads/benthompsondev/cloakscan/total?label=downloads)](https://github.com/benthompsondev/cloakscan/releases)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

CloakScan is a local-first desktop app (Windows and Linux) for cleaning code, logs, prompts, support tickets, and draft posts before sharing them. Scanning runs on your device. There is no account, backend, telemetry, or upload.

I built it because manually checking every script and log for hostnames, usernames, paths, tokens, and organization-specific details is slow and easy to get wrong. The workflow is deliberately simple: paste text, scan it locally, review every replacement, and copy the cleaned version.

![CloakScan demo: load a synthetic sample, scan locally, and review the cleaned text](docs/media/cloakguard-demo.gif)

![CloakScan showing a local scan and review](docs/screenshots/scan-desktop-1440x900.png)

## Why CloakScan

Pasting sensitive text into an unknown redaction website defeats the point. CloakScan keeps the scan on your device and shows every replacement before you copy the result.

It is smaller and more focused than a full DLP platform or repository secret scanner. It does not monitor files, enforce company policy, or promise to catch everything. It is meant for the awkward last step before sharing a log, script, prompt, ticket, or post. Built-in rules handle common formats, and Cloak Lists cover the names and work-specific terms only you know.

⭐ Star it if it is useful. That makes the project easier for other people to find.

## Choose how to run it

### Web demo

[Open the live demo](https://benthompsondev.github.io/cloakscan/) to try CloakScan without installing anything. Scanning runs inside your browser and nothing is uploaded. The desktop apps are the better choice when you want fully offline use.

### Windows

Download `CloakScan-Setup-1.3.0-x64.exe` from [GitHub Releases](https://github.com/benthompsondev/cloakscan/releases/latest), open it, and follow the installer. It installs for the current Windows user and does not require Node, Rust, administrator rights, or an internet connection.

The installer is currently unsigned, so Windows SmartScreen may show a warning. Verify the published SHA-256 checksum before running it.

### Linux (x86_64)

Download either the `.deb` package or AppImage from [GitHub Releases](https://github.com/benthompsondev/cloakscan/releases/latest).

For Debian 12, Ubuntu 22.04, or newer, install the `.deb`:

```bash
cd ~/Downloads
sudo apt install ./CloakScan_1.3.0_amd64.deb
```

Launch it from your applications menu or run:

```bash
cloakscan
```

The AppImage is portable and does not install anything:

```bash
cd ~/Downloads
chmod +x CloakScan_1.3.0_amd64.AppImage
./CloakScan_1.3.0_amd64.AppImage
```

See [the Linux guide](docs/linux.md) for updates, uninstall steps, and troubleshooting.

## Run from source

**Windows** - from this folder in PowerShell:

```powershell
.\Start-CloakScan.ps1
```

**macOS / Linux** - from this folder in a terminal:

```bash
./start-cloakscan.sh
```

Both scripts check that a supported Node.js is installed: **Node 20.19+ or 22.12+**. They never install Node for you or need admin/root. They run `npm ci` only when dependencies are missing or out of sync with `package-lock.json`, then build the production app with its strict Content Security Policy and serve it on `127.0.0.1`.

**To stop the app:** press `Ctrl+C` in the terminal window where it is running.

Developers can build the desktop packages with `npm run desktop:build` — it produces the NSIS installer on Windows ([docs/desktop.md](docs/desktop.md)) and the `.deb` + AppImage on Linux ([docs/linux.md](docs/linux.md)).

**Developer setup** (`npm run dev` is the development path, with hot reload and no CSP):

```powershell
npm ci            # install dependencies
npm run dev       # dev server (development only)
npm run check     # lint + unit tests + typecheck + build
npm run test:e2e  # Playwright desktop tests (first: npx playwright install chromium)
npm run verify    # audit + lint + unit tests + build + e2e, all in one
```

## What it does

1. Paste text, import a text/log/code/config file (read in memory, max 2 MB; UTF-8 and UTF-16 PowerShell files both decode correctly), or use **Load sample** for one synthetic incident that covers secrets, infrastructure, and labeled personal data.
2. Click **Scan locally**. CloakScan has 48 focused detectors covering common secrets, credentials, network details, ports, file paths, cloud identifiers, personal data, regional formats, and IT automation fingerprints (AD groups, directory attributes, Exchange and credential workflow terms — most of those are review leads that point without rewriting). Its API-key detector recognizes 33 distinctive provider, webhook, and signed-URL patterns without guessing from entropy, including AWS long-term and temporary access-key IDs. Balanced handles everyday scans. Strict adds contextual personal information. Maximum adds every country pack. Code & secrets leaves prose PII off. See [Detector behavior and safety](docs/detectors.md) for the full list and known limits.
3. Use **Hide custom terms** for exact names, domains, hostnames, project names, or other values the built-in rules cannot know. These terms last for the current session only. You can give them their own placeholder label and format. For reusable terms, create a **Cloak List** under Settings > Profiles & Packs. Cloak Lists export/import as `.txt` (terms only) or `.json` (terms plus mappings and options), and support **mappings** — term → generic replacement pairs for cleaning code.
4. Review **Possible names & terms to review**. These are guesses only. Nothing is hidden until you choose **Hide this session** or add the term to a reusable Cloak List.
5. Review the findings. Each one shows its category, severity, a masked preview, and the replacement placeholder. Toggle off anything you want to keep. **Review leads** start unchecked — they point at IT-automation fingerprints worth a look without rewriting anything.
6. Pick an output mode: **Safe-share** (bracket placeholders, the default) or **Portfolio-code** (mapped terms inside variable/function/property/command names become valid generic identifiers, so PowerShell headed for a public repo still reads as code). See [Output modes and Cloak List mappings](docs/output-modes.md).
7. Copy the cleaned output or download it as a `.txt` file. Formatting is preserved, and repeated values reuse the same placeholder. If a placeholder landed somewhere that breaks code, a warning panel says so.

## How it works

CloakScan protects code-shaped input, runs the rules you enabled, resolves overlapping findings predictably, and builds the cleaned result without reformatting the surrounding text. See [the architecture and privacy notes](docs/architecture.md) for the scan flow, configuration order, storage boundary, and desktop shell.

Release notes are kept in the [changelog](CHANGELOG.md).

## Settings

The **Settings** view (in-app navigation, no page reloads) controls detection without touching any code:

- **General** - Choose Balanced or Strict detection and control the opt-in preference storage.
- **Profiles & Packs** - Build reusable profiles from country packs, Cloak Lists, custom rules, and a redaction format. The Profile Editor keeps changes in a draft until you save. You can also create a new Cloak List or Custom Pack without leaving that draft.
- **Detection Rules** - Search the detector registry, review false-positive guidance, and enable or disable individual rules.
- **Redaction Formats** - Use indexed labels (`[EMAIL_1]`), unnumbered labels (`[EMAIL]`), a uniform `[REDACTED]` value, or a safe template using `{TYPE}` and `{INDEX}`.
- **Privacy** - Review storage status and clear saved preferences.

**Preference storage is opt-in and narrow.** By default, named profiles, custom packs, Cloak Lists, custom rules, and terms vanish on reload. If you enable "Remember preferences", one allowlisted localStorage key stores the configuration, never source text, filenames, findings, matched values, output, or clipboard data. Cloak List terms need a second per-list opt-in before they are saved. Those saved values are plain, unencrypted local data. Terms entered through **Hide custom terms** never persist.

**Why no scan history:** sanitized output can still contain a value the detectors missed, so automatically saving results would weaken the privacy model. Scans are deliberately never persisted.

Detector findings are review leads, not verdicts. CloakScan protects common PowerShell regex pattern strings, leaves generated password expressions untouched, and avoids guessing that arbitrary AD arguments are usernames. See [Detector behavior and safety](docs/detectors.md) for the exact replacement rules and remaining boundaries.

## Verify it works

Run `npm run check`. Lint, unit tests, typecheck, and build should all pass. `npm run test:e2e` runs Playwright against the production build, including a check that the app contacts no non-local origin.

## Privacy model

- All scanning happens locally. Content is never uploaded, and CloakScan has no telemetry or analytics. The desktop app (Windows and Linux) contacts GitHub only when you click **Check for updates**. Browser and Pages builds do not show that control. The production launcher binds to `127.0.0.1`.
- Content is never persisted. Refresh or **Clear session** wipes source text, findings, output, and session-only custom terms. The only optional storage is the narrow preference configuration described above.
- Imported files are read with the browser File API and never uploaded. Downloads are generated in memory.
- Detected values are masked in the UI and never logged. The production build also has a strict Content Security Policy that blocks outbound browser connection APIs.
- **Automated detection can miss sensitive information. Review before sharing.** This is a helper, not a guarantee. See [SECURITY.md](SECURITY.md).

## Project status

Current release: **v1.3.0**

- Windows and Linux x86_64 packages now ship together from the same release.
- Windows and AppImage builds can apply signed updates when the user asks. The `.deb` package checks for new versions but updates manually.
- Debian packages now include a complete description and richer AppStream details for software managers that read them.
- Desktop project links now open in the system browser through a two-origin allowlist.
- AWS temporary access-key IDs are covered alongside long-term IDs.
- Both Linux formats now carry the AppStream metainfo.
- Forty-one focused rules include 33 distinctive provider, webhook, and signed-URL patterns.
- The name-and-term review panel filters common PowerShell noise, puts likely multi-word terms first, and lets you dismiss a suggestion for the current session.
- Balanced, Strict, Maximum, and Code & secrets give people useful starting points without hiding individual rule controls.
- Session terms and Cloak Lists can use their own safe placeholder label and format.
- The built-in sample now gives one clear comparison between Balanced and Strict.
- Four-part software versions stay visible when they appear after common version labels.

CloakScan is still a detection helper, not a guarantee or compliance product. Always review the cleaned text before sharing it.

## Contributing

Issues and pull requests are welcome. Use synthetic examples only and read [CONTRIBUTING.md](CONTRIBUTING.md) before sharing a detector sample.

Six synthetic files under [examples/stress-tests](examples/stress-tests) are available for longer manual checks covering PowerShell, support logs, mixed configuration, custom organization terms, name/organization detection, and provider token shapes.

## License

MIT. See [LICENSE](LICENSE).
