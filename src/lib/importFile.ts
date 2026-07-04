/**
 * File-import rules. Files are read entirely in memory with the browser File
 * API; nothing is uploaded anywhere.
 */

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024; // 2 MiB of text is plenty

/** Common text, log, code, data, and configuration extensions. */
const ACCEPTED_EXTENSIONS = [
  'txt', 'log', 'md', 'text', 'out', 'err',
  'json', 'jsonl', 'csv', 'tsv', 'xml', 'yml', 'yaml', 'toml', 'ini', 'conf', 'cfg', 'config', 'env', 'properties',
  'ps1', 'psm1', 'psd1', 'sh', 'bash', 'bat', 'cmd',
  'py', 'js', 'mjs', 'cjs', 'ts', 'tsx', 'jsx', 'cs', 'java', 'go', 'rs', 'rb', 'php', 'sql', 'c', 'h', 'cpp', 'html', 'css',
];

/** Value for the file input's accept attribute. */
export const IMPORT_ACCEPT = ACCEPTED_EXTENSIONS.map((ext) => `.${ext}`).join(',');

/**
 * Validate a candidate file by name, size, and MIME type.
 * Returns a user-facing error message, or null when the file is acceptable.
 */
export function validateImportFile(name: string, size: number, mimeType = ''): string | null {
  if (size > MAX_IMPORT_BYTES) {
    return `File is too large (limit ${Math.floor(MAX_IMPORT_BYTES / 1024 / 1024)} MB of text).`;
  }
  if (mimeType.startsWith('text/')) return null;
  const dot = name.lastIndexOf('.');
  const ext = dot >= 0 ? name.slice(dot + 1).toLowerCase() : '';
  if (ext && ACCEPTED_EXTENSIONS.includes(ext)) return null;
  return 'Unsupported file type. Import plain text, logs, code, JSON, CSV, or config files.';
}
