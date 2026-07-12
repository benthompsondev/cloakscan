import { useMemo, useState } from 'react';
import type { Finding } from '../lib/types';
import type { OutputMode } from '../lib/sanitize';
import { compareOutputModes } from '../lib/comparison';
import type { Notice } from '../App';

interface ComparisonPanelProps {
  sourceText: string;
  /** Raw scan findings — both versions are derived from these, no rescan. */
  findings: Finding[];
  outputMode: OutputMode;
  onSetOutputMode: (mode: OutputMode) => void;
  onNotice: (notice: Notice) => void;
}

/**
 * Compact side-by-side view of the two sanitized outputs. Everything shown
 * here is sanitized — there is no "before" view, because the original values
 * must never render as a comparison column. Opening or switching costs no
 * rescan: both versions splice the findings the scan already produced.
 */
export function ComparisonPanel({
  sourceText,
  findings,
  outputMode,
  onSetOutputMode,
  onNotice,
}: ComparisonPanelProps) {
  const [open, setOpen] = useState(false);
  const comparison = useMemo(
    () => (open ? compareOutputModes(sourceText, findings) : null),
    [open, sourceText, findings],
  );

  const copy = async (label: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      onNotice({ kind: 'ok', text: `${label} output copied to clipboard.` });
    } catch {
      onNotice({ kind: 'err', text: 'Copy failed — select the text and copy it manually.' });
    }
  };

  return (
    <section className="panel comparison-panel" aria-label="Compare output modes">
      <button
        type="button"
        className="candidate-panel-head"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="finding-section-caret" aria-hidden="true">
          {open ? '▾' : '▸'}
        </span>
        <span>
          <strong>Compare output modes</strong>
          <span className="candidate-count">Safe-share vs Portfolio-code, side by side</span>
        </span>
      </button>

      {open && comparison && (
        <>
          <p className="muted candidate-note">
            Both versions come from the findings above — nothing is rescanned, and only
            sanitized text is shown.{' '}
            {comparison.changedLineCount === 0
              ? 'The two modes currently produce identical output (no mapping carries a replacement).'
              : `${comparison.changedLineCount} line${
                  comparison.changedLineCount === 1 ? '' : 's'
                } differ between the modes.`}
          </p>
          <div className="comparison-grid">
            {(
              [
                { mode: 'safe-share' as OutputMode, label: 'Safe-share', text: comparison.safeShare },
                {
                  mode: 'portfolio-code' as OutputMode,
                  label: 'Portfolio-code',
                  text: comparison.portfolioCode,
                },
              ] as const
            ).map(({ mode, label, text }) => (
              <div className="comparison-pane" key={mode} aria-label={`${label} output`}>
                <div className="comparison-pane-head">
                  <strong>{label}</strong>
                  {outputMode === mode && <span className="chip chip-ready">Main preview</span>}
                  <span className="toolbar-spacer" aria-hidden="true" />
                  <button
                    type="button"
                    className="btn btn-mini"
                    onClick={() => void copy(label, text)}
                  >
                    Copy {label}
                  </button>
                  {outputMode !== mode && (
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => onSetOutputMode(mode)}
                    >
                      Use in main preview
                    </button>
                  )}
                </div>
                <pre className="comparison-text" tabIndex={0}>
                  {text}
                </pre>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
