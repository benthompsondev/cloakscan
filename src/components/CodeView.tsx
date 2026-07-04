import type { Line } from '../lib/segments';

interface CodeViewProps {
  lines: Line[];
  label: string;
}

/** Line-numbered read-only code view with highlighted matches/placeholders. */
export function CodeView({ lines, label }: CodeViewProps) {
  return (
    <div className="code-view" role="region" aria-label={label} tabIndex={0}>
      {lines.map((segments, i) => (
        <div className="code-line" key={i}>
          <span className="code-ln" aria-hidden="true">
            {i + 1}
          </span>
          <span className="code-text">
            {segments.map((s, j) =>
              s.kind === 'plain' ? (
                <span key={j}>{s.text}</span>
              ) : s.kind === 'match' ? (
                <mark key={j} className={`hl hl-${s.category} ${s.enabled ? '' : 'hl-off'}`}>
                  {s.text}
                </mark>
              ) : (
                <span key={j} className={`ph ph-${s.category}`}>
                  {s.text}
                </span>
              ),
            )}
            {segments.length === 0 && ' '}
          </span>
        </div>
      ))}
    </div>
  );
}
