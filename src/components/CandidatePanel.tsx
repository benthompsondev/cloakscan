import { useState } from 'react';
import type { CloakCandidate } from '../lib/candidates';

interface CandidatePanelProps {
  candidates: CloakCandidate[];
  onHideCandidate: (term: string) => void;
}

export function CandidatePanel({ candidates, onHideCandidate }: CandidatePanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="panel candidate-panel" aria-label="Possible names and terms to review">
      <button
        type="button"
        className="candidate-panel-head"
        aria-expanded={!collapsed}
        onClick={() => setCollapsed((value) => !value)}
      >
        <span className="finding-section-caret" aria-hidden="true">
          {collapsed ? '▸' : '▾'}
        </span>
        <span>
          <strong>Possible names &amp; terms to review</strong>
          <span className="candidate-count">
            {candidates.length} suggestion{candidates.length === 1 ? '' : 's'}
          </span>
        </span>
      </button>

      {!collapsed && (
        <>
          <p className="muted candidate-note">
            These are guesses, not detections — nothing here is redacted until you add it. Built-in
            rules can't safely detect arbitrary names or company terms, so review these and hide the
            ones that matter.
          </p>
          <ul className="candidate-list">
            {candidates.map((candidate) => (
              <li
                className="candidate-row"
                key={`${candidate.firstStart}:${candidate.text}`}
                aria-label={`Suggested term ${candidate.text}`}
              >
                <span className="candidate-value">
                  {candidate.text}
                  <span className="muted">
                    {candidate.count} occurrence{candidate.count === 1 ? '' : 's'}
                  </span>
                </span>
                <span className="candidate-actions">
                  <button
                    type="button"
                    className="btn btn-primary btn-mini"
                    onClick={() => onHideCandidate(candidate.text)}
                  >
                    Hide this session
                  </button>
                  <a className="btn btn-ghost btn-mini" href="#/settings/profiles">
                    Add to a Cloak List
                  </a>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
