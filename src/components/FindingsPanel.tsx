import { useState } from 'react';
import type { Category } from '../lib/types';
import type { FindingGroup } from '../lib/groups';
import { maskValue } from '../lib/mask';

interface FindingsPanelProps {
  groups: FindingGroup[];
  onToggleGroup: (ids: readonly string[], enabled: boolean) => void;
}

const CATEGORIES: { id: Category; label: string }[] = [
  { id: 'secrets', label: 'Secrets' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'personal', label: 'Personal' },
  { id: 'paths', label: 'Paths' },
];

/** Findings organized into compact collapsible category sections. */
export function FindingsPanel({ groups, onToggleGroup }: FindingsPanelProps) {
  const [collapsed, setCollapsed] = useState<Partial<Record<Category, boolean>>>({});
  const totalMatches = groups.reduce((n, g) => n + g.count, 0);

  const toggleSection = (category: Category) =>
    setCollapsed((c) => ({ ...c, [category]: !c[category] }));

  return (
    <section className="panel findings" aria-label="Findings">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Findings</h2>
          <span className="muted">
            {groups.length} finding{groups.length === 1 ? '' : 's'} · {totalMatches} total match
            {totalMatches === 1 ? '' : 'es'}
          </span>
        </div>
      </div>
      {groups.length === 0 ? (
        <div className="output-empty muted">
          Nothing detected. Automated detection can still miss things — review manually.
        </div>
      ) : (
        <div className="finding-sections">
          {CATEGORIES.map((category) => {
            const sectionGroups = groups.filter((g) => g.category === category.id);
            if (sectionGroups.length === 0) return null;
            const isOpen = !collapsed[category.id];
            const sectionIds = sectionGroups.flatMap((g) => g.ids);
            return (
              <div className={`finding-section cat-${category.id}`} key={category.id}>
                <div className="finding-section-bar">
                  <button
                    type="button"
                    className="finding-section-head"
                    aria-expanded={isOpen}
                    onClick={() => toggleSection(category.id)}
                  >
                    <span className="finding-section-caret" aria-hidden="true">
                      {isOpen ? '▾' : '▸'}
                    </span>
                    <span className={`section-dot dot-${category.id}`} aria-hidden="true" />
                    {category.label} ({sectionGroups.length})
                    <span className="muted finding-section-matches">
                      {sectionGroups.reduce((n, g) => n + g.count, 0)} match
                      {sectionGroups.reduce((n, g) => n + g.count, 0) === 1 ? '' : 'es'}
                    </span>
                  </button>
                  <span className="finding-section-actions">
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => onToggleGroup(sectionIds, true)}
                      aria-label={`Redact all ${category.label} findings`}
                    >
                      Redact all
                    </button>
                    <button
                      type="button"
                      className="btn btn-mini"
                      onClick={() => onToggleGroup(sectionIds, false)}
                      aria-label={`Keep all ${category.label} findings as-is`}
                    >
                      Keep all
                    </button>
                  </span>
                </div>
                {isOpen && (
                  <ul className="finding-rows">
                    {sectionGroups.map((g) => (
                      <li key={g.key} className="finding-row">
                        <div className="finding-row-main">
                          <span className="finding-name">{g.name}</span>
                          <span className={`chip chip-${g.severity}`}>{g.severity}</span>
                        </div>
                        <span className="finding-row-value muted">
                          {g.count}× · <code className="masked">{maskValue(g.value)}</code>
                        </span>
                        <code className="placeholder-code">
                          {g.enabled ? g.placeholder : 'kept as-is'}
                        </code>
                        <label className="switch">
                          <input
                            type="checkbox"
                            role="switch"
                            checked={g.enabled}
                            onChange={() => onToggleGroup(g.ids, !g.enabled)}
                            aria-label={`Redact ${g.name} (${g.count} match${g.count === 1 ? '' : 'es'})`}
                          />
                          <span className="switch-track" aria-hidden="true" />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="panel-foot">
        <span className="muted">Enabled findings are redacted in the preview pane.</span>
      </div>
    </section>
  );
}
