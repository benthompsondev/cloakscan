import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriCore = vi.hoisted(() => ({
  invoke: vi.fn(),
  isTauri: vi.fn(),
}));
vi.mock('@tauri-apps/api/core', () => tauriCore);

import { downloadTextFile } from './download';

interface FakeAnchor {
  href: string;
  download: string;
  click: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
}

/** Minimal DOM/URL stubs so the browser path runs in the node test env. */
function stubBrowserGlobals() {
  const anchor: FakeAnchor = { href: '', download: '', click: vi.fn(), remove: vi.fn() };
  const appended: unknown[] = [];
  vi.stubGlobal('document', {
    createElement: vi.fn(() => anchor),
    body: { appendChild: (el: unknown) => appended.push(el) },
  });
  const createObjectURL = vi.fn(() => 'blob:cloakguard-test');
  const revokeObjectURL = vi.fn();
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
  return { anchor, appended, createObjectURL, revokeObjectURL };
}

beforeEach(() => {
  tauriCore.invoke.mockReset();
  tauriCore.isTauri.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('downloadTextFile in the browser', () => {
  it('builds a blob download, clicks it, and resolves "downloaded"', async () => {
    tauriCore.isTauri.mockReturnValue(false);
    const { anchor, createObjectURL, revokeObjectURL } = stubBrowserGlobals();

    const result = await downloadTextFile('cloakguard-clean.txt', 'cleaned [EMAIL_1]');

    expect(result).toBe('downloaded');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(anchor.download).toBe('cloakguard-clean.txt');
    expect(anchor.href).toBe('blob:cloakguard-test');
    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.remove).toHaveBeenCalledTimes(1);
    expect(tauriCore.invoke).not.toHaveBeenCalled();

    // The object URL is revoked on the next tick, after the click.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 5));
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:cloakguard-test');
  });
});

describe('downloadTextFile on the desktop (Tauri)', () => {
  it('invokes exactly the export_clean_text command with the text as contents', async () => {
    tauriCore.isTauri.mockReturnValue(true);
    tauriCore.invoke.mockResolvedValue(true);

    const result = await downloadTextFile('cloakguard-clean.txt', 'note for [CUSTOM_TERM_1]');

    expect(result).toBe('saved');
    expect(tauriCore.invoke).toHaveBeenCalledTimes(1);
    expect(tauriCore.invoke).toHaveBeenCalledWith('export_clean_text', {
      contents: 'note for [CUSTOM_TERM_1]',
    });
  });

  it('resolves "cancelled" when the user closes the save dialog', async () => {
    tauriCore.isTauri.mockReturnValue(true);
    tauriCore.invoke.mockResolvedValue(false);
    await expect(downloadTextFile('f.txt', 'text')).resolves.toBe('cancelled');
  });

  it('propagates command errors to the caller', async () => {
    tauriCore.isTauri.mockReturnValue(true);
    tauriCore.invoke.mockRejectedValue(new Error('disk full'));
    await expect(downloadTextFile('f.txt', 'text')).rejects.toThrow('disk full');
  });

  it('never touches the DOM download path on desktop', async () => {
    tauriCore.isTauri.mockReturnValue(true);
    tauriCore.invoke.mockResolvedValue(true);
    const { anchor, createObjectURL } = stubBrowserGlobals();
    await downloadTextFile('f.txt', 'text');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(anchor.click).not.toHaveBeenCalled();
  });
});
