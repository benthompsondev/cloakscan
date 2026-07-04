import { useMemo, useRef } from 'react';
import type { Finding } from '../lib/types';
import { buildSourceSegments, segmentsToLines } from '../lib/segments';
import { decodeText } from '../lib/decodeText';
import { IMPORT_ACCEPT, validateImportFile } from '../lib/importFile';
import { DEMO_TEXT, DEMO_TEXT_PII } from '../lib/demo';
import { CodeView } from './CodeView';
import type { Notice } from '../App';

interface SourcePanelProps {
  value: string;
  findings: Finding[];
  hasScanned: boolean;
  onChange: (text: string) => void;
  onScan: () => void;
  onNotice: (notice: Notice) => void;
}

export function SourcePanel({
  value,
  findings,
  hasScanned,
  onChange,
  onScan,
  onNotice,
}: SourcePanelProps) {
  const fileInput = useRef<HTMLInputElement>(null);
  const lines = value === '' ? 0 : value.split('\n').length;

  const highlightedLines = useMemo(
    () => (hasScanned ? segmentsToLines(buildSourceSegments(value, findings)) : []),
    [hasScanned, value, findings],
  );

  const paste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text === '') {
        onNotice({ kind: 'err', text: 'Clipboard is empty.' });
        return;
      }
      onChange(text);
      onNotice({ kind: 'ok', text: 'Pasted from clipboard.' });
    } catch {
      onNotice({
        kind: 'err',
        text: 'Clipboard access was blocked — click the text area and press Ctrl+V instead.',
      });
    }
  };

  const importFile = async (file: File) => {
    const error = validateImportFile(file.name, file.size, file.type);
    if (error) {
      onNotice({ kind: 'err', text: error });
      return;
    }
    try {
      const text = decodeText(new Uint8Array(await file.arrayBuffer()));
      if (text === null) {
        onNotice({ kind: 'err', text: 'Could not decode that file as text.' });
        return;
      }
      onChange(text);
      onNotice({ kind: 'ok', text: `Imported ${file.name} — content stays in memory only.` });
    } catch {
      onNotice({ kind: 'err', text: 'Could not read that file.' });
    }
  };

  return (
    <section className="panel" aria-label="Source text">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-num" aria-hidden="true">
            1
          </span>
          <h2>Source Text</h2>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={paste}>
            Paste
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Synthetic IT/admin log sample"
            onClick={() => onChange(DEMO_TEXT)}
          >
            Load sample
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            title="Synthetic personal/PII sample — best with the Strict profile"
            onClick={() => onChange(DEMO_TEXT_PII)}
          >
            PII sample
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
            Import file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={IMPORT_ACCEPT}
            className="visually-hidden"
            aria-label="Import a text file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = ''; // allow re-importing the same file
            }}
          />
        </div>
      </div>
      {hasScanned ? (
        <CodeView lines={highlightedLines} label="Detected items highlighted in the original content" />
      ) : (
        <textarea
          className="source-input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Paste code, logs, prompts, tickets, or a draft post here. Nothing leaves this device."
          spellCheck={false}
          autoComplete="off"
          autoCorrect="off"
          aria-label="Source text input"
        />
      )}
      <div className="panel-foot">
        <span className="muted">
          {lines} lines · {value.length} characters · text is not saved
        </span>
        <div className="panel-actions">
          {hasScanned && (
            <>
              <span className="detected-count">{findings.length} detected</span>
              <button type="button" className="btn btn-ghost" onClick={() => onChange(value)}>
                Edit text
              </button>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={onScan} disabled={value === ''}>
            Scan locally
          </button>
        </div>
      </div>
    </section>
  );
}
