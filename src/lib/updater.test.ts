import { describe, expect, it } from 'vitest';
import { compareVersions, updateErrorMessage } from './updater';

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
});
