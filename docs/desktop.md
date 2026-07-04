# CloakGuard for Windows (desktop)

CloakGuard ships to Windows users as **one setup executable**:
`release/windows/CloakGuard-Setup-0.6.5-x64.exe`. Download it, run it, and
launch CloakGuard from the Start Menu. No Node, npm, Rust, source folders,
manual dependencies, or internet access are needed — the installer even
bundles the WebView2 runtime installer, so installation itself works offline
("offline" meaning exactly that the installer downloads nothing).

It is the same fully client-side app as the web build, loaded from files
bundled inside the executable — no localhost server, no external browser
window, no remote assets, and no remote application requests.

## For users

- **Install:** run the setup EXE. It installs per-user under
  `%LOCALAPPDATA%\CloakGuard` and never asks for administrator rights.
- **Publisher shown by Windows:** `CloakGuard Project`. This is package
  metadata, not a code-signing claim.
- **Shortcuts:** a Start Menu entry is always created; the finish page offers
  an optional Desktop shortcut.
- **Uninstall:** use Windows *Settings → Apps* (CloakGuard registers a
  normal per-user uninstall entry). The uninstaller shows a **"Delete the
  application data"** checkbox: leave it unchecked and your saved
  preferences (if you opted in) survive under
  `%LOCALAPPDATA%\dev.benthompson.cloakguard\`; check it and the uninstaller
  removes that folder — saved preferences, saved pack terms, and the
  WebView2 engine profile included. *Clear preferences* inside the app works
  at any time before uninstalling.
- **Unsigned installer:** the setup EXE is not code-signed, so Windows
  SmartScreen will warn ("Windows protected your PC" → *More info → Run
  anyway*). That is expected for this local build; verify the SHA-256
  published on the [GitHub release](https://github.com/benthompsondev/cloakguard/releases)
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
`release/windows/CloakGuard-Setup-<version>-x64.exe` for distribution
staging. Both locations are git-ignored; no binaries live in tracked source
directories. The bare `src-tauri\target\release\cloakguard.exe` is a
**developer artifact only** — it runs, but users should always install via
the setup EXE. `cargo audit` is not part of `desktop:verify` because
cargo-audit is not installed on this machine.

## What the desktop shell is (and is not)

- The Rust side is near-empty on purpose. Exactly **one** app command
  exists: `export_clean_text`, which opens a native save dialog and writes
  the sanitized text to the path the user picked. It exists because WebView2
  silently ignores the browser blob-download the web build uses. The app
  cannot read any file and cannot write anywhere the user did not explicitly
  choose in that dialog.
- The IPC surface is locked twice: the build-time command ACL
  (`build.rs`) rejects every command except `export_clean_text`, and the
  window capability grants only `allow-export-clean-text` — no core
  defaults and no dialog, filesystem, shell, HTTP, clipboard, menu, tray,
  event, image, window, or devtools permissions. `withGlobalTauri` is off;
  the frontend talks to the shell only through `@tauri-apps/api/core`'s
  `invoke`. A unit test (`src/lib/desktopConfig.test.ts`) fails if any of
  this loosens.
- Production loads the bundled Vite `dist` assets directly from the binary
  via `http://tauri.localhost` — nothing listens on a TCP port and no
  external browser window is opened.
- The strict CSP from the web build (including `connect-src 'none'`) ships
  unchanged inside the bundled `index.html`; Tauri is configured not to
  replace it.
- Release builds have devtools disabled (the `devtools` cargo feature is not
  enabled) and contain no updater, telemetry, analytics, HTTP, or WebSocket
  code.
- **CloakGuard vs. WebView2:** CloakGuard itself makes no remote requests.
  The embedded WebView2 runtime is Microsoft's platform component: it keeps
  its own engine cache/profile under
  `%LOCALAPPDATA%\dev.benthompson.cloakguard\EBWebView` and may
  independently perform platform networking of its own. CloakGuard launches
  it with `--disable-background-networking --disable-component-update
  --disable-domain-reliability --no-pings` on top of the SmartScreen-off
  defaults, and never hands it content to send — but no claim is made that
  the entire process tree can never produce any network traffic. The app is
  fully functional with networking unavailable.

## Installer configuration (NSIS)

- Per-user (`installMode: currentUser`), no admin, Windows Apps/Uninstall
  registration, bundled CloakGuard icon.
- `webviewInstallMode: offlineInstaller` embeds the full WebView2 offline
  installer — the reason the setup EXE is large. On machines that already
  have WebView2 (any up-to-date Windows 10/11), nothing extra is installed.
- The NSIS setup EXE is the only recommended user-facing artifact. An MSI
  can be built (`npm run tauri build -- --bundles msi`) but installs
  per-machine, prompts for admin, and is not the primary download.
