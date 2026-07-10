# CloakScan for Windows (desktop)

> Looking for Linux? The `.deb` / AppImage guide is [docs/linux.md](linux.md).

CloakScan ships to Windows users as **one setup executable**:
`release/windows/CloakScan-Setup-1.3.0-x64.exe`. Download it, run it, and
launch CloakScan from the Start Menu. No Node, npm, Rust, source folders,
manual dependencies, or internet access are needed — the installer even
bundles the WebView2 runtime installer, so installation itself works offline
("offline" meaning exactly that the installer downloads nothing).

It is the same client-side scanner as the web build, loaded from files
bundled inside the executable. There is no localhost server, external
browser window, remote asset, backend, upload, or telemetry. The only
application network feature is the user-triggered update check described
below.

## For users

- **Install:** run the setup EXE. It installs per-user under
  `%LOCALAPPDATA%\CloakScan` and never asks for administrator rights.
- **Publisher shown by Windows:** `CloakScan Project`. This is package
  metadata, not a code-signing claim.
- **Shortcuts:** a Start Menu entry is always created; the finish page offers
  an optional Desktop shortcut.
- **Uninstall:** use Windows *Settings → Apps* (CloakScan registers a
  normal per-user uninstall entry). The uninstaller shows a **"Delete the
  application data"** checkbox: leave it unchecked and your saved
  preferences (if you opted in) survive under
  `%LOCALAPPDATA%\dev.benthompson.cloakscan\`; check it and the uninstaller
  removes that folder — saved preferences, saved pack terms, and the
  WebView2 engine profile included. *Clear preferences* inside the app works
  at any time before uninstalling.
- **Unsigned installer:** the setup EXE is not code-signed, so Windows
  SmartScreen will warn ("Windows protected your PC" → *More info → Run
  anyway*). That is expected for this local build; verify the SHA-256
  published on the [GitHub release](https://github.com/benthompsondev/cloakscan/releases)
  instead. Do not trust copies from anywhere else.

## For developers

| Task | Command |
| --- | --- |
| Desktop development (hot reload) | `npm run desktop:dev` |
| Compile-check the Rust shell | `npm run desktop:check` |
| Rust shell checks + tests | `npm run desktop:verify` |
| Production build + installer | `npm run desktop:build` |
| Browser workflows (unchanged) | `npm run dev`, `npm run start:local`, `npm run verify` |

`desktop:build` runs the web `npm run build` first, compiles the Rust shell
in release mode, and produces the installer under
`src-tauri\target\release\bundle\nsis\` — copy it to
`release/windows/CloakScan-Setup-<version>-x64.exe` for distribution
staging. Both locations are git-ignored; no binaries live in tracked source
directories. The bare `src-tauri\target\release\cloakscan.exe` is a
**developer artifact only** — it runs, but users should always install via
the setup EXE. `cargo audit` is not part of `desktop:verify` because
cargo-audit is not installed on this machine.

## What the desktop shell is (and is not)

- The Rust side is small on purpose. Exactly **two app-specific commands**
  exist. `export_clean_text` opens a native save dialog and writes the
  sanitized text only to the path the user picked. `can_self_update` returns
  one Boolean so the Linux UI can distinguish an AppImage from a `.deb`; it
  never exposes environment values. The app cannot read arbitrary files and
  cannot write anywhere the user did not explicitly choose.
- The app-command surface is locked twice: the build-time command ACL
  (`build.rs`) rejects every command except `export_clean_text` and
  `can_self_update`. The window capability grants those two commands,
  the updater's signed check/download/install commands, process restart,
  and URL opening limited to CloakScan's GitHub repository and live demo.
  It cannot open arbitrary URLs or local files. There are still no core
  defaults or general dialog, filesystem, shell, HTTP, clipboard, menu,
  tray, event, image, window, or devtools permissions. `withGlobalTauri`
  is off.
  A unit test (`src/lib/desktopConfig.test.ts`) fails if this surface widens.
- Production loads the bundled Vite `dist` assets directly from the binary
  via `http://tauri.localhost`, so nothing listens on a TCP port. Project
  links open in the system browser through the narrowly scoped opener
  permission; the scanner webview does not navigate to remote pages.
- The strict CSP from the web build (including `connect-src 'none'`) ships
  unchanged inside the bundled `index.html`; Tauri is configured not to
  replace it.
- Release builds have devtools disabled (the `devtools` cargo feature is not
  enabled) and contain no telemetry, analytics, general HTTP, or WebSocket
  permission.
- **Updates:** the About page offers a manual **Check for updates** action.
  Nothing runs at launch or in the background. The Tauri updater plugin
  contacts the latest GitHub release, verifies the downloaded package with
  the bundled public key, and installs it only after another user click. The
  webview CSP remains `connect-src 'none'`.
- **CloakScan vs. WebView2:** outside that click-only update flow, CloakScan
  makes no remote application requests.
  The embedded WebView2 runtime is Microsoft's platform component: it keeps
  its own engine cache/profile under
  `%LOCALAPPDATA%\dev.benthompson.cloakscan\EBWebView` and may
  independently perform platform networking of its own. CloakScan launches
  it with `--disable-background-networking --disable-component-update
  --disable-domain-reliability --no-pings` on top of the SmartScreen-off
  defaults, and never hands it content to send — but no claim is made that
  the entire process tree can never produce any network traffic. The app is
  fully functional with networking unavailable except, naturally, checking
  for an update.

## Installer configuration (NSIS)

- Per-user (`installMode: currentUser`), no admin, Windows Apps/Uninstall
  registration, bundled CloakScan icon.
- `webviewInstallMode: offlineInstaller` embeds the full WebView2 offline
  installer — the reason the setup EXE is large. On machines that already
  have WebView2 (any up-to-date Windows 10/11), nothing extra is installed.
- The NSIS setup EXE is the only recommended user-facing artifact. An MSI
  can be built (`npm run tauri build -- --bundles msi`) but installs
  per-machine, prompts for admin, and is not the primary download.
