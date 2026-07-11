import type { ReadinessReport } from '../lib/readiness';
import type { OutputMode } from '../lib/sanitize';

interface ReadinessSummaryProps {
  report: ReadinessReport;
  outputMode: OutputMode;
}

/**
 * Sanitization readiness: what still deserves a look before sharing. Honest
 * by design — "ready" means no open items, never a guarantee.
 */
export function ReadinessSummary({ report, outputMode }: ReadinessSummaryProps) {
  return (
    <section
      className={`panel readiness ${report.status === 'ready' ? 'readiness-ready' : 'readiness-review'}`}
      aria-label="Sanitization readiness"
    >
      <div className="panel-head">
        <div className="panel-title">
          <h2>Sanitization readiness</h2>
          <span className={`chip ${report.status === 'ready' ? 'chip-ready' : 'chip-review'}`}>
            {report.status === 'ready' ? 'No open items' : `${report.items.length} to review`}
          </span>
        </div>
      </div>
      {report.status === 'ready' ? (
        <p className="muted readiness-note">
          Nothing from this scan is left open. Automated detection can still miss things — give
          the output one last read before sharing.
        </p>
      ) : (
        <ul className="readiness-items">
          {report.items.map((item) => (
            <li key={item.kind} className={`readiness-item readiness-${item.tone}`}>
              <span className={`readiness-dot dot-${item.tone}`} aria-hidden="true" />
              {item.message}
            </li>
          ))}
        </ul>
      )}
      {report.replacementCount > 0 && (
        <p className="muted readiness-note">
          {outputMode === 'portfolio-code'
            ? `Portfolio-code mode is keeping ${report.replacementCount} mapped identifier${
                report.replacementCount === 1 ? '' : 's'
              } readable. Safe-share mode would turn ${
                report.replacementCount === 1 ? 'it' : 'them'
              } into bracket placeholders.`
            : `Safe-share mode is using bracket placeholders everywhere. Portfolio-code mode would keep ${report.replacementCount} mapped identifier${
                report.replacementCount === 1 ? '' : 's'
              } readable as code.`}
        </p>
      )}
    </section>
  );
}
