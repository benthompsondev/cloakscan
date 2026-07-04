import { describe, expect, it } from 'vitest';
import { MAX_IMPORT_BYTES, validateImportFile } from './importFile';

describe('validateImportFile', () => {
  it('accepts common text, log, code, and config extensions', () => {
    for (const name of ['a.txt', 'app.log', 'data.json', 'rows.csv', 'web.config', 'run.ps1', 'x.py']) {
      expect(validateImportFile(name, 1024)).toBeNull();
    }
  });

  it('accepts unknown extensions when the MIME type is text', () => {
    expect(validateImportFile('notes.weird', 1024, 'text/plain')).toBeNull();
  });

  it('rejects binary-looking files', () => {
    expect(validateImportFile('photo.png', 1024)).toMatch(/Unsupported file type/);
    expect(validateImportFile('archive.zip', 1024, 'application/zip')).toMatch(/Unsupported/);
    expect(validateImportFile('noextension', 1024)).toMatch(/Unsupported/);
  });

  it('rejects oversized files regardless of type', () => {
    expect(validateImportFile('big.txt', MAX_IMPORT_BYTES + 1)).toMatch(/too large/);
    expect(validateImportFile('big.txt', MAX_IMPORT_BYTES)).toBeNull();
  });
});
