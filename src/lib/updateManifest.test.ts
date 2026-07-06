import { describe, expect, it } from 'vitest';
import {
  buildManifest,
  mergeManifest,
  renderManifest,
  validateManifest,
  type PlatformEntry,
} from '../../scripts/update-manifest.mjs';

/**
 * The updater manifest (latest.json) is release infrastructure: one bad or
 * missing platform entry strands every install on that platform at its
 * current version. These tests pin the script's guarantees — both platforms
 * required, no empty values, no overwriting a shipped entry, deterministic
 * output, and an outright refusal of secret-key material.
 */

const WINDOWS_ENTRY: PlatformEntry = {
  signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkK',
  url: 'https://github.com/benthompsondev/cloakguard/releases/download/v1.1.0/CloakGuard_1.1.0_x64-setup.exe',
};

const LINUX_ENTRY: PlatformEntry = {
  signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZSBmcm9tIHRhdXJpIHNlY3JldCBrZXkx',
  url: 'https://github.com/benthompsondev/cloakguard/releases/download/v1.1.0/CloakGuard_1.1.0_amd64.AppImage',
};

const BOTH = {
  'windows-x86_64': WINDOWS_ENTRY,
  'linux-x86_64': LINUX_ENTRY,
};

function build(overrides: Partial<Parameters<typeof buildManifest>[0]> = {}) {
  return buildManifest({
    version: '1.1.0',
    notes: 'CloakGuard 1.1.0',
    pubDate: '2026-08-01T00:00:00Z',
    platforms: BOTH,
    ...overrides,
  });
}

describe('buildManifest', () => {
  it('accepts a complete two-platform manifest', () => {
    const manifest = build();
    expect(manifest.version).toBe('1.1.0');
    expect(Object.keys(manifest.platforms).sort()).toEqual(['linux-x86_64', 'windows-x86_64']);
  });

  it('requires both windows-x86_64 and linux-x86_64', () => {
    expect(() => build({ platforms: { 'windows-x86_64': WINDOWS_ENTRY } })).toThrow(
      /missing the required platform "linux-x86_64"/,
    );
    expect(() => build({ platforms: { 'linux-x86_64': LINUX_ENTRY } })).toThrow(
      /missing the required platform "windows-x86_64"/,
    );
  });

  it('rejects empty or missing signatures and URLs', () => {
    expect(() =>
      build({ platforms: { ...BOTH, 'linux-x86_64': { ...LINUX_ENTRY, signature: '' } } }),
    ).toThrow(/signature must be the non-empty contents/);
    expect(() =>
      build({ platforms: { ...BOTH, 'linux-x86_64': { ...LINUX_ENTRY, signature: '   ' } } }),
    ).toThrow(/signature must be the non-empty contents/);
    expect(() =>
      build({ platforms: { ...BOTH, 'windows-x86_64': { ...WINDOWS_ENTRY, url: '' } } }),
    ).toThrow(/url must be a non-empty string/);
  });

  it('rejects non-https URLs', () => {
    expect(() =>
      build({
        platforms: {
          ...BOTH,
          'windows-x86_64': { ...WINDOWS_ENTRY, url: 'http://example.test/setup.exe' },
        },
      }),
    ).toThrow(/must be https/);
  });

  it('refuses anything that looks like secret-key material in a signature', () => {
    for (const leaked of [
      'untrusted comment: minisign encrypted secret key\nRWRT…',
      ['-----BEGIN ', 'PRIVATE KEY-----'].join(''),
    ]) {
      expect(() =>
        build({ platforms: { ...BOTH, 'linux-x86_64': { ...LINUX_ENTRY, signature: leaked } } }),
      ).toThrow(/secret-key material/);
    }
  });

  it('rejects malformed versions and pub dates', () => {
    expect(() => build({ version: 'not-a-version' })).toThrow(/semantic version/);
    expect(() => build({ pubDate: '2026-08-01' })).toThrow(/RFC 3339/);
  });
});

describe('mergeManifest', () => {
  const existing = validateManifest({
    version: '1.1.0',
    notes: 'CloakGuard 1.1.0',
    pub_date: '2026-08-01T00:00:00Z',
    platforms: { 'windows-x86_64': WINDOWS_ENTRY, 'linux-x86_64': LINUX_ENTRY },
  });

  it('adds a new platform while preserving the existing entries byte for byte', () => {
    const windowsOnly = {
      version: '1.1.0',
      notes: 'CloakGuard 1.1.0',
      pub_date: '2026-08-01T00:00:00Z',
      platforms: { 'windows-x86_64': WINDOWS_ENTRY },
    };
    const merged = mergeManifest(windowsOnly, { 'linux-x86_64': LINUX_ENTRY });
    expect(merged.platforms['windows-x86_64']).toEqual(WINDOWS_ENTRY);
    expect(merged.platforms['linux-x86_64']).toEqual(LINUX_ENTRY);
  });

  it('never overwrites a platform that already shipped', () => {
    expect(() =>
      mergeManifest(existing, {
        'windows-x86_64': { ...WINDOWS_ENTRY, url: 'https://example.test/other.exe' },
      }),
    ).toThrow(/refusing to overwrite/);
  });
});

describe('renderManifest', () => {
  it('produces deterministic JSON regardless of platform insertion order', () => {
    const a = build({ platforms: { 'windows-x86_64': WINDOWS_ENTRY, 'linux-x86_64': LINUX_ENTRY } });
    const b = build({ platforms: { 'linux-x86_64': LINUX_ENTRY, 'windows-x86_64': WINDOWS_ENTRY } });
    expect(renderManifest(a)).toBe(renderManifest(b));
  });

  it('emits the exact Tauri updater shape with sorted platforms and a trailing newline', () => {
    const rendered = renderManifest(build());
    expect(rendered.endsWith('\n')).toBe(true);
    const parsed = JSON.parse(rendered);
    expect(Object.keys(parsed)).toEqual(['version', 'notes', 'pub_date', 'platforms']);
    expect(Object.keys(parsed.platforms)).toEqual(['linux-x86_64', 'windows-x86_64']);
    expect(Object.keys(parsed.platforms['linux-x86_64'])).toEqual(['signature', 'url']);
  });

  it('refuses to render an incomplete manifest', () => {
    const manifest = build();
    delete (manifest.platforms as Record<string, unknown>)['linux-x86_64'];
    expect(() => renderManifest(manifest)).toThrow(/missing the required platform/);
  });
});
