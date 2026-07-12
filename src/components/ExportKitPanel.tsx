import { useState } from 'react';
import type { Finding } from '../lib/types';
import type { OutputMode } from '../lib/sanitize';
import type { ReadinessReport } from '../lib/readiness';
import { applyOutputMode, buildCleanText } from '../lib/sanitize';
import {
  PORTFOLIO_EXPORT_FILENAMES,
  buildExportAggregates,
  buildFindingsSummary,
  buildReviewChecklist,
  type PortfolioExportFilename,
} from '../lib/portfolioExport';
import { downloadTextFile } from '../lib/download';
import { APP_VERSION } from '../lib/version';
import type { Notice } from '../App';

interface ExportKitPanelProps {
  sourceText: string;
  /** Raw scan findings — exports derive everything from these on click. */
  findings: Finding[];
  outputMode: OutputMode;
  readiness: ReadinessReport;
  onNotice: (notice: Notice) => void;
}

/**
 * Portfolio Export Kit: three files, each generated fresh at click time and
 * handed straight to the download path — nothing is kept in state. The
 * summary and checklist are aggregate-only by construction (see
 * lib/portfolioExport.ts). When readiness still has warnings, every export
 * needs an explicit "Export anyway" — exporting is never a sign-off.
 */
export function ExportKitPanel({
  sourceText,
  findings,
  outputMode,
  readiness,
  onNotice,
}: ExportKitPanelProps) {
  const [pendingExport, setPendingExport] = useState<PortfolioExportFilename | null>(null);
  const openWarnings = readiness.items.filter((item) => item.tone === 'warn').length;

  const contentFor = (filename: PortfolioExportFilename): string => {
    if (filename === PORTFOLIO_EXPORT_FILENAMES.portfolio) {
      return buildCleanText(sourceText, applyOutputMode(findings, 'portfolio-code'));
    }
    if (filename === PORTFOLIO_EXPORT_FILENAMES.summary) {
      return buildFindingsSummary({
        appVersion: APP_VERSION,
        outputMode,
        aggregates: buildExportAggregates(findings, readiness),
      });
    }
    return buildReviewChecklist();
  };

  const runExport = async (filename: PortfolioExportFilename) => {
    setPendingExport(null);
    try {
      const result = await downloadTextFile(filename, contentFor(filename));
      onNotice({
        kind: result === 'cancelled' ? 'err' : 'ok',
        text:
          result === 'cancelled'
            ? 'Export cancelled. Nothing was written.'
            : `Exported ${filename}.`,
      });
    } catch {
      onNotice({ kind: 'err', text: 'Could not export the file.' });
    }
  };

  const requestExport = (filename: PortfolioExportFilename) => {
    if (openWarnings > 0) {
      setPendingExport(filename);
    } else {
      void runExport(filename);
    }
  };

  const exports: { filename: PortfolioExportFilename; label: string; hint: string }[] = [
    {
      filename: PORTFOLIO_EXPORT_FILENAMES.portfolio,
      label: 'Portfolio script (.ps1)',
      hint: 'The Portfolio-code sanitized output, nothing else.',
    },
    {
      filename: PORTFOLIO_EXPORT_FILENAMES.summary,
      label: 'Findings summary (.txt)',
      hint: 'Aggregate counts only — no values, no names.',
    },
    {
      filename: PORTFOLIO_EXPORT_FILENAMES.checklist,
      label: 'Review checklist (.md)',
      hint: 'Fixed manual-review checklist to finish the job by hand.',
    },
  ];

  return (
    <section className="panel export-kit" aria-label="Portfolio Export Kit">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Portfolio Export Kit</h2>
          <span className="muted">
            Three files, generated on click, from this scan only.
          </span>
        </div>
      </div>
      <ul className="export-kit-list">
        {exports.map(({ filename, label, hint }) => (
          <li key={filename} className="export-kit-row">
            <span className="export-kit-info">
              <strong>{label}</strong>
              <span className="muted">
                <code>{filename}</code> — {hint}
              </span>
            </span>
            {pendingExport === filename ? (
              <span className="export-kit-confirm">
                <span className="muted export-warning">
                  Readiness still has {openWarnings} open warning{openWarnings === 1 ? '' : 's'}.
                  Exporting is not a sign-off — those items stay yours to review.
                </span>
                <button
                  type="button"
                  className="btn btn-mini"
                  onClick={() => void runExport(filename)}
                >
                  Export anyway
                </button>
                <button
                  type="button"
                  className="btn btn-mini"
                  onClick={() => setPendingExport(null)}
                >
                  Cancel
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-ghost btn-mini"
                onClick={() => requestExport(filename)}
              >
                Export
              </button>
            )}
          </li>
        ))}
      </ul>
      <p className="muted readiness-note">
        The summary and checklist carry counts and fixed text only. Automated detection can
        miss sensitive information — review every file before sharing it.
      </p>
    </section>
  );
}
