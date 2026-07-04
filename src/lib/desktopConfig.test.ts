/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from './version';

/**
 * Desktop privacy invariants. These read the real src-tauri configuration so
 * a loosened surface (a new permission, a global Tauri object, a changed
 * install mode) fails the normal unit suite, not just a manual review.
 */

const root = join(__dirname, '..', '..');
const conf = JSON.parse(readFileSync(join(root, 'src-tauri', 'tauri.conf.json'), 'utf8'));
const capability = JSON.parse(
  readFileSync(join(root, 'src-tauri', 'capabilities', 'main.json'), 'utf8'),
);
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

describe('tauri.conf.json privacy surface', () => {
  it('does not expose a global Tauri object to the page', () => {
    expect(conf.app.withGlobalTauri).toBe(false);
  });

  it('keeps versions aligned across package.json, tauri.conf.json, and APP_VERSION', () => {
    expect(conf.version).toBe(pkg.version);
    expect(APP_VERSION).toBe(pkg.version);
  });

  it('ships the per-user offline NSIS installer only', () => {
    expect(conf.bundle.targets).toEqual(['nsis']);
    expect(conf.bundle.windows.webviewInstallMode.type).toBe('offlineInstaller');
    expect(conf.bundle.windows.nsis.installMode).toBe('currentUser');
  });

  it('never injects a replacement CSP over the built one', () => {
    expect(conf.app.security.csp).toBeNull();
  });

  it('keeps the stable identifier and product name', () => {
    expect(conf.identifier).toBe('dev.benthompson.cloakguard');
    expect(conf.productName).toBe('CloakGuard');
  });

  it('uses the public project identity in installer metadata', () => {
    expect(conf.bundle.publisher).toBe('CloakGuard Project');
    expect(conf.bundle.homepage).toBe('https://github.com/benthompsondev/cloakguard');
  });
});

describe('capability grants', () => {
  it('grants exactly allow-export-clean-text and nothing else', () => {
    expect(capability.permissions).toEqual(['allow-export-clean-text']);
  });

  it('does not grant core defaults or any plugin surface', () => {
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
    ]) {
      expect(all, `permission list must not contain "${banned}"`).not.toContain(banned);
    }
  });

  it('applies to the main window only', () => {
    expect(capability.windows).toEqual(['main']);
  });
});
