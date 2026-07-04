import { useMemo } from 'react';
import type { Finding } from '../lib/types';
import { buildPreviewSegments, segmentsToLines } from '../lib/segments';
import { downloadTextFile } from '../lib/download';
import { CodeView } from './CodeView';
import type { Notice } from '../App';

interface PreviewPanelProps {
  hasScanned: boolean;
  sourceText: string;
  findings: Finding[];
  cleanText: string;
  onNotice: (notice: Notice) => void;
}

export function PreviewPanel({
  hasScanned,
  sourceText,
  findings,
  cleanText,
  onNotice,
}: PreviewPanelProps) {
  const lines = useMemo(
    () => (hasScanned ? segmentsToLines(buildPreviewSegments(sourceText, findings)) : []),
    [hasScanned, sourceText, findings],
  );
  const replacements = findings.filter((f) => f.enabled).length;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cleanText);
      onNotice({ kind: 'ok', text: 'Cleaned text copied to clipboard.' });
    } catch {
      onNotice({
        kind: 'err',
        text: 'Copy failed — select the preview text and copy it manually.',
      });
    }
  };

  const download = async () => {
    try {
      const result = await downloadTextFile('cloakguard-clean.txt', cleanText);
      const text = {
        downloaded: 'Download started.',
        saved: 'Cleaned text saved.',
        cancelled: 'Save cancelled. Nothing was written.',
      }[result];
      onNotice({ kind: 'ok', text });
    } catch {
      onNotice({ kind: 'err', text: 'Could not save the file.' });
    }
  };

  return (
    <section className="panel" aria-label="Redacted preview">
      <div className="panel-head">
        <div className="panel-title">
          <span className="panel-num" aria-hidden="true">
            2
          </span>
          <h2>Redacted Preview</h2>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={copy} disabled={!hasScanned}>
            Copy clean text
          </button>
          <button type="button" className="btn btn-ghost" onClick={download} disabled={!hasScanned}>
            Download .txt
          </button>
        </div>
      </div>
      {hasScanned ? (
        <CodeView lines={lines} label="Sanitized output with placeholders" />
      ) : (
        <div className="output-empty muted">Run a scan to see the sanitized version here.</div>
      )}
      <div className="panel-foot">
        <span className="muted">
          {hasScanned
            ? `${lines.length} lines · ${cleanText.length} characters`
            : 'No scan yet'}
        </span>
        {hasScanned && (
          <span className="redaction-status">
            {replacements} replacement{replacements === 1 ? '' : 's'} applied
          </span>
        )}
      </div>
    </section>
  );
}
