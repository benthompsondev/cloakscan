import { beforeEach, describe, expect, it, vi } from 'vitest';
import { canSelfUpdate, compareVersions, updateErrorMessage } from './updater';

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
}));

vi.mock('@tauri-apps/api/core', () => tauriCore);

beforeEach(() => {
  tauriCore.invoke.mockReset();
});

describe('compareVersions', () => {
  it('compares major, minor, and patch versions', () => {
    expect(compareVersions('1.0.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.10.0', '0.9.9')).toBeGreaterThan(0);
    expect(compareVersions('0.9.1', '0.9.0')).toBeGreaterThan(0);
  });

  it('accepts a leading v and ignores build metadata', () => {
    expect(compareVersions('v0.9.0+windows', '0.9.0')).toBe(0);
  });

  it('orders prereleases below their stable release', () => {
    expect(compareVersions('0.9.0-beta.2', '0.9.0')).toBeLessThan(0);
    expect(compareVersions('0.9.0-beta.10', '0.9.0-beta.2')).toBeGreaterThan(0);
  });

  it('rejects malformed versions', () => {
    expect(() => compareVersions('0.9', '0.9.0')).toThrow('Invalid semantic version');
  });
});

describe('updateErrorMessage', () => {
  it('explains signature failures without implying installation succeeded', () => {
    expect(updateErrorMessage(new Error('signature verification failed'), 'install')).toContain(
      'Nothing was installed',
    );
  });

  it('turns network failures into a useful retry message', () => {
    expect(updateErrorMessage(new Error('network timed out'), 'check')).toContain(
      'Check your connection',
    );
  });

  it('gives an honest message when the platform is not in the manifest', () => {
    const detail = 'the platform `linux-x86_64` was not found on the response `platforms` object';
    const message = updateErrorMessage(new Error(detail), 'check');
    expect(message).toContain('No desktop update is published for this platform yet');
    expect(message).not.toContain('try again');
  });

  it('handles the real Tauri fallback-platform error without suggesting a retry', () => {
    const detail =
      'None of the fallback platforms `["linux-x86_64", "linux-amd64"]` were found in the response `platforms` object';
    const message = updateErrorMessage(detail, 'check');
    expect(message).toContain('No desktop update is published for this platform yet');
    expect(message).not.toContain('try again');
  });

  it('handles Tauri release-fetch failures as network errors', () => {
    const detail = 'Could not fetch a valid release JSON from the remote';
    expect(updateErrorMessage(detail, 'check')).toContain('Check your connection');
  });
});

describe('canSelfUpdate', () => {
  it('asks only for the read-only desktop update capability', async () => {
    tauriCore.invoke.mockResolvedValue(false);
    await expect(canSelfUpdate()).resolves.toBe(false);
    expect(tauriCore.invoke).toHaveBeenCalledWith('can_self_update');
  });
});
