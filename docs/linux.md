# CloakGuard for Linux (desktop)

> Looking for Windows? The setup-EXE guide is [docs/desktop.md](desktop.md).

CloakGuard ships for Linux as two **x86_64** packages built from the same
source and the same privacy model as the Windows app:

- **`.deb`** — for Debian 12, Ubuntu 22.04, or newer. Installs through the
  system package manager and pulls in its WebKitGTK dependencies.
- **AppImage** — one portable file, no installation. This is also the
  artifact the in-app updater uses.

Only x86_64 is built right now. Other architectures (ARM) and other package
formats (RPM, Flatpak, Snap) are not supported yet, and no claim is made
that every distribution works — the tested baseline is Debian 12 / Ubuntu
22.04 or newer.

It is the same client-side scanner as the web build, loaded from files
bundled inside the package. There is no localhost server, external browser
window, remote asset, backend, upload, or telemetry. The only application
network feature is the user-triggered **Check for updates** action.

## Install the .deb (Debian 12 / Ubuntu 22.04+)

```bash
sudo apt install ./CloakGuard_<version>_amd64.deb
```

`apt` resolves the WebKitGTK runtime dependencies automatically. Launch
CloakGuard from your application menu or with `cloakguard`.

- **Updating:** the `.deb` does **not** auto-update. When a new release is
  out, download the new `.deb` and install it the same way — it replaces the
  old version. The in-app **Check for updates** can still tell you a newer
  version exists and opens the GitHub release page for the new package.
- **Uninstalling:** `sudo apt remove cloak-guard`. Saved preferences (if you
  opted in) live under `~/.local/share/dev.benthompson.cloakguard/` and the
  WebKitGTK engine profile under `~/.cache/`; remove those folders yourself
  if you want them gone, or use *Clear preferences* inside the app first.
  The `.deb` also includes AppStream metadata so compatible software managers
  can identify CloakGuard as an installed application.

Ubuntu App Center can still show **Unknown publisher** or **License unknown**
for a sideloaded `.deb`, and it may not offer an uninstall action under
*Manage*. Those labels come from App Center's handling of sideloaded packages,
not missing fields CloakGuard can fill inside the package. GNOME Software and
KDE Discover can read the bundled AppStream details. The supported uninstall
command remains:

```bash
sudo apt remove cloak-guard
```

## Run the AppImage (portable)

```bash
chmod +x CloakGuard_<version>_amd64.AppImage
./CloakGuard_<version>_amd64.AppImage
```

No installation and no root. Keep the file wherever you like.

- **Updating:** the AppImage is the Linux auto-update artifact. Click
  **Check for updates** in the app; the updater downloads the new AppImage
  from the GitHub release, verifies its signature against the public key
  built into the app, and replaces itself only after you confirm. Nothing
  runs at launch or in the background.
- **Uninstalling:** delete the file. Preference data (if you opted in) is in
  the same `~/.local/share/dev.benthompson.cloakguard/` folder as the .deb
  install.

## Privacy on Linux

Identical to every other CloakGuard build: scanning runs on your device,
content stays in memory, nothing is uploaded, and there is no telemetry.
The webview keeps the strict production CSP (`connect-src 'none'`); the
update check runs on the Rust side and only after you click it. The
rendering engine on Linux is **WebKitGTK** — platform software with its own
cache/profile, same caveat as any browser. See [SECURITY.md](../SECURITY.md)
for the exact guarantees.

## Troubleshooting

- **AppImage does not start and prints a FUSE error** — install FUSE 2
  (`sudo apt install libfuse2` on Ubuntu 22.04+), or run it without FUSE:
  `./CloakGuard_<version>_amd64.AppImage --appimage-extract-and-run`.
- **`.deb` install complains about webkit dependencies** — run
  `sudo apt -f install` to let apt pull the WebKitGTK runtime, and confirm
  you are on Debian 12 / Ubuntu 22.04 or newer.
- **Blank or white window** — some GPU/driver combinations need WebKitGTK
  compositing turned off: `WEBKIT_DISABLE_COMPOSITING_MODE=1 cloakguard`
  (or the same variable in front of the AppImage).
- **Nothing happens on a Wayland session** — try forcing X11 for the run:
  `GDK_BACKEND=x11 cloakguard`.

## For developers

Build prerequisites on Debian/Ubuntu (the same list CI installs):

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file \
  libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
  appstream desktop-file-utils
```

Plus Node 20.19+/22.12+ and a stable Rust toolchain (`rustup`).

| Task | Command |
| --- | --- |
| Desktop development (hot reload) | `npm run desktop:dev` |
| Compile-check the Rust shell | `npm run desktop:check` |
| Rust shell checks + tests | `npm run desktop:verify` |
| Production `.deb` + AppImage | `npm run desktop:build` |
| Browser workflows (unchanged) | `npm run dev`, `npm run start:local`, `npm run verify` |

`desktop:build` writes the packages under
`src-tauri/target/release/bundle/deb/` and
`src-tauri/target/release/bundle/appimage/`. The platform packaging config
lives in `src-tauri/tauri.linux.conf.json`; everything security-relevant
(CSP, capabilities, updater key and endpoint) stays in the shared
`src-tauri/tauri.conf.json` and is covered by unit tests.

The `Linux packaging` GitHub Actions workflow (manual trigger) builds both
packages on Ubuntu 22.04, inspects the `.deb`, smoke-launches the AppImage
under Xvfb, and uploads everything with checksums as workflow artifacts.
