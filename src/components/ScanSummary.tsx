interface ScanSummaryProps {
  startedAt: Date | null;
  durationMs: number | null;
  ruleCount: number;
  itemsDetected: number;
  redactionsApplied: number;
}

export function ScanSummary({
  startedAt,
  durationMs,
  ruleCount,
  itemsDetected,
  redactionsApplied,
}: ScanSummaryProps) {
  return (
    <aside className="panel summary" aria-label="Scan summary">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Scan summary</h2>
        </div>
      </div>
      <dl className="summary-list">
        <div className="summary-row">
          <dt>Started</dt>
          <dd>{startedAt ? startedAt.toLocaleTimeString() : '—'}</dd>
        </div>
        <div className="summary-row">
          <dt>Duration</dt>
          <dd>{durationMs === null ? '—' : `${Math.max(1, Math.round(durationMs))} ms`}</dd>
        </div>
        <div className="summary-row">
          <dt>Engine</dt>
          <dd>Local, on-device</dd>
        </div>
        <div className="summary-row">
          <dt>Rules</dt>
          <dd>{ruleCount}</dd>
        </div>
        <div className="summary-row">
          <dt>Items detected</dt>
          <dd>{itemsDetected}</dd>
        </div>
        <div className="summary-row">
          <dt>Redactions applied</dt>
          <dd>{redactionsApplied}</dd>
        </div>
      </dl>
      <div className="summary-card">
        <div className="summary-card-title">Local scan complete</div>
        <p className="muted">Your text never left this device.</p>
        <p className="muted summary-warning">
          Automated detection can miss sensitive information. Review before sharing.
        </p>
      </div>
    </aside>
  );
}
