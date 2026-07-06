import { invoke, isTauri } from '@tauri-apps/api/core';

/** What actually happened to the cleaned text. */
export type ExportResult = 'downloaded' | 'saved' | 'cancelled';

/**
 * Export text as a file.
 *
 * Browser: an in-memory Blob behind a temporary object URL, revoked right
 * after the click so no reference to the content outlives the action.
 * Resolves 'downloaded'.
 *
 * Desktop (Tauri): embedded webviews (WebView2 on Windows, WebKitGTK on
 * Linux) do not reliably honor blob-anchor downloads, so the shell exposes
 * exactly one command that opens a native save dialog and writes the text
 * to the user-chosen path — no other filesystem access exists in the app.
 * Resolves 'saved', or 'cancelled' when the user closes the dialog without
 * choosing a destination (nothing is written).
 */
export async function downloadTextFile(filename: string, text: string): Promise<ExportResult> {
  if (isTauri()) {
    const saved = await invoke<boolean>('export_clean_text', { contents: text });
    return saved ? 'saved' : 'cancelled';
  }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Defer revocation one tick so the browser has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return 'downloaded';
}
