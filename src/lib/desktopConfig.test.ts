/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './version';

/**
 * Desktop privacy invariants. These read the real src-tauri configuration so
 * a loosened surface (a new permission, a global Tauri object, a changed
 * install mode) fails the normal unit suite, not just a manual review.
 *
 * The configuration is split: tauri.conf.json holds the shared,
 * platform-neutral settings, and tauri.windows.conf.json /
 * tauri.linux.conf.json are per-platform overlays that Tauri merges on top
 * at build time. The merge deep-merges objects and REPLACES arrays, so the
 * tests below both check each file and check the merged per-platform result.
 */

const root = join(__dirname, '..', '..');

function readJson(...segments: string[]): Record<string, unknown> {
  return JSON.parse(readFileSync(join(root, ...segments), 'utf8'));
}

/** Mirror Tauri's platform-config merge: objects deep-merge, arrays replace. */
function mergeConfig(base: unknown, overlay: unknown): unknown {
  if (
    typeof base !== 'object' ||
    base === null ||
    Array.isArray(base) ||
    typeof overlay !== 'object' ||
    overlay === null ||
    Array.isArray(overlay)
  ) {
    return overlay === undefined ? base : overlay;
  }
  const result: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(overlay as Record<string, unknown>)) {
    result[key] = key in result ? mergeConfig(result[key], value) : value;
  }
  return result;
}

const shared = readJson('src-tauri', 'tauri.conf.json');
const windowsOverlay = readJson('src-tauri', 'tauri.windows.conf.json');
const linuxOverlay = readJson('src-tauri', 'tauri.linux.conf.json');
/* eslint-disable @typescript-eslint/no-explicit-any */
const windowsConf = mergeConfig(shared, windowsOverlay) as any;
const linuxConf = mergeConfig(shared, linuxOverlay) as any;
const sharedConf = shared as any;
const windowsOnly = windowsOverlay as any;
const linuxOnly = linuxOverlay as any;
/* eslint-enable @typescript-eslint/no-explicit-any */
const capability = readJson('src-tauri', 'capabilities', 'main.json');
const pkg = readJson('package.json');
const linuxMetainfo = readFileSync(
  join(root, 'src-tauri', 'linux', 'dev.benthompson.cloakguard.metainfo.xml'),
  'utf8',
);

describe('shared tauri.conf.json privacy surface', () => {
  it('does not expose a global Tauri object to the page', () => {
    expect(sharedConf.app.withGlobalTauri).toBe(false);
  });

  it('keeps versions aligned across package.json, tauri.conf.json, and APP_VERSION', () => {
    expect(sharedConf.version).toBe(pkg.version);
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('never injects a replacement CSP over the built one', () => {
    expect(sharedConf.app.security.csp).toBeNull();
  });

  it('keeps the stable identifier and product name', () => {
    expect(sharedConf.identifier).toBe('dev.benthompson.cloakguard');
    expect(sharedConf.productName).toBe('CloakGuard');
  });

  it('uses the public project identity in installer metadata', () => {
    expect(sharedConf.bundle.publisher).toBe('CloakGuard Project');
    expect(sharedConf.bundle.homepage).toBe('https://github.com/benthompsondev/cloakguard');
    expect(sharedConf.bundle.longDescription).toContain('scans pasted text locally');
    expect(sharedConf.bundle.longDescription).toContain('not uploaded');
    expect(sharedConf.bundle.longDescription).toContain('review the cleaned text');
  });

  it('creates signed updater artifacts against the GitHub release manifest', () => {
    expect(sharedConf.bundle.createUpdaterArtifacts).toBe(true);
    expect(sharedConf.plugins.updater.pubkey).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(sharedConf.plugins.updater.endpoints).toEqual([
      'https://github.com/benthompsondev/cloakguard/releases/latest/download/latest.json',
    ]);
  });

  it('stays platform-neutral: bundle targets and platform blocks live in overlays', () => {
    expect(sharedConf.bundle.targets).toBeUndefined();
    expect(sharedConf.bundle.windows).toBeUndefined();
    expect(sharedConf.bundle.linux).toBeUndefined();
    expect(sharedConf.app.windows[0].additionalBrowserArgs).toBeUndefined();
  });
});

describe('platform overlays', () => {
  it('do not touch security, updater, identity, or capability settings', () => {
    for (const overlay of [windowsOnly, linuxOnly]) {
      expect(overlay.app?.security).toBeUndefined();
      expect(overlay.plugins).toBeUndefined();
      expect(overlay.identifier).toBeUndefined();
      expect(overlay.productName).toBeUndefined();
      expect(overlay.version).toBeUndefined();
      expect(overlay.app?.withGlobalTauri).toBeUndefined();
      expect(overlay.bundle?.createUpdaterArtifacts).toBeUndefined();
    }
  });

  it('Windows ships the per-user offline NSIS installer only', () => {
    expect(windowsConf.bundle.targets).toEqual(['nsis']);
    expect(windowsConf.bundle.windows.webviewInstallMode.type).toBe('offlineInstaller');
    expect(windowsConf.bundle.windows.nsis.installMode).toBe('currentUser');
  });

  it('Windows keeps the WebView2 background-networking flags on a complete window entry', () => {
    // Arrays are replaced (not merged) by the platform overlay, so the
    // Windows window entry must be complete on its own.
    expect(windowsConf.app.windows).toHaveLength(1);
    const win = windowsConf.app.windows[0];
    expect(win.title).toBe('CloakGuard');
    expect(win.width).toBe(1280);
    expect(win.height).toBe(860);
    expect(win.minWidth).toBe(1024);
    expect(win.minHeight).toBe(680);
    expect(win.center).toBe(true);
    for (const flag of [
      '--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-domain-reliability',
      '--no-pings',
    ]) {
      expect(win.additionalBrowserArgs).toContain(flag);
    }
  });

  it('Linux ships deb and AppImage for x86_64 with no Windows leftovers', () => {
    expect(linuxConf.bundle.targets).toEqual(['deb', 'appimage']);
    expect(linuxOnly.bundle.windows).toBeUndefined();
    expect(linuxConf.app.windows[0].additionalBrowserArgs).toBeUndefined();
  });

  it('Linux installs AppStream metadata for desktop software managers', () => {
    expect(linuxConf.bundle.linux.deb.files).toEqual({
      '/usr/share/metainfo/dev.benthompson.cloakguard.metainfo.xml':
        'linux/dev.benthompson.cloakguard.metainfo.xml',
    });
    expect(linuxMetainfo).toContain('<id>dev.benthompson.cloakguard</id>');
    expect(linuxMetainfo).toContain('<launchable type="desktop-id">CloakGuard.desktop</launchable>');
    expect(linuxMetainfo).toContain('<project_license>MIT</project_license>');
    expect(linuxMetainfo).toContain('<content_rating type="oars-1.1"/>');
    expect(linuxMetainfo).toContain('<developer id="dev.benthompson">');
    expect(linuxMetainfo).toContain(
      '<url type="bugtracker">https://github.com/benthompsondev/cloakguard/issues</url>',
    );
    for (const keyword of ['redact', 'sanitize', 'secrets', 'privacy', 'PII']) {
      expect(linuxMetainfo).toContain(`<keyword>${keyword}</keyword>`);
    }
    expect(linuxMetainfo).toContain('<screenshots>');
    expect(linuxMetainfo).toContain('raw.githubusercontent.com');
  });

  it('both merged platforms keep the privacy invariants', () => {
    for (const conf of [windowsConf, linuxConf]) {
      expect(conf.app.withGlobalTauri).toBe(false);
      expect(conf.app.security.csp).toBeNull();
      expect(conf.bundle.createUpdaterArtifacts).toBe(true);
      expect(conf.identifier).toBe('dev.benthompson.cloakguard');
      expect(conf.plugins.updater.endpoints).toEqual([
        'https://github.com/benthompsondev/cloakguard/releases/latest/download/latest.json',
      ]);
    }
  });
});

describe('capability grants', () => {
  it('grants only file export and the user-triggered update flow', () => {
    expect(capability.permissions).toEqual([
      'allow-export-clean-text',
      'allow-can-self-update',
      'updater:default',
      'process:allow-restart',
    ]);
  });

  it('does not grant core defaults or unrelated plugin surfaces', () => {
    const all = JSON.stringify(capability.permissions);
    for (const banned of [
      'core:',
      'dialog:',
      'fs:',
      'shell:',
      'http:',
      'clipboard',
      'menu',
      'tray',
      'event',
      'image',
      'window:',
      'webview',
      'devtools',
      'process:allow-exit',
    ]) {
      expect(all, `permission list must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it('applies to the main window only', () => {
    expect(capability.windows).toEqual(['main']);
  });
});
