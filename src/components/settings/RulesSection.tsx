import { useMemo, useState } from 'react';
import { detectors } from '../../lib/detectors';
import type { Category, Detector } from '../../lib/types';
import { RULE_INFO } from '../../lib/ruleInfo';
import { packsForDetector } from '../../lib/packs';
import { scanText } from '../../lib/scan';
import { buildCleanText } from '../../lib/sanitize';
import { templateFor, type RedactionChoice } from '../../lib/redaction';
import type { SettingsProps } from './SettingsView';

/** Short badge text per built-in pack for the rules table. */
const PACK_BADGES: Record<string, string> = {
  'pack-ca-v1': 'CA',
  'pack-us-v1': 'US',
  'pack-eu-v1': 'EU',
};

const CATEGORY_FILTERS: { id: 'all' | Category; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'secrets', label: 'Secrets' },
  { id: 'infrastructure', label: 'Infrastructure' },
  { id: 'personal', label: 'Personal' },
  { id: 'paths', label: 'Paths' },
];

const CONFIDENCE_SHORT: Record<string, string> = {};
for (const d of detectors) {
  CONFIDENCE_SHORT[d.id] = RULE_INFO[d.id]?.confidence.split(' ')[0].replace(/[^A-Za-z]/g, '') ?? '';
}

/**
 * The filterable rule list with toggles and the detail panel. Shared between
 * the Detection Rules page (editing the ACTIVE configuration) and the Profile
 * Editor (editing a DRAFT) — one presentation, one detector registry, and the
 * caller decides what a toggle mutates.
 */
export function RuleBrowser({
  query,
  resolvedStates,
  format,
  onToggleRule,
}: {
  query: string;
  resolvedStates: Record<string, boolean>;
  format: RedactionChoice;
  onToggleRule: (id: string, enabled: boolean) => void;
}) {
  const [filter, setFilter] = useState<'all' | Category>('all');
  const [enabledOnly, setEnabledOnly] = useState(false);
  const [strictOnly, setStrictOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const visible = detectors.filter(
    (d) =>
      (filter === 'all' || d.category === filter) &&
      (!enabledOnly || resolvedStates[d.id]) &&
      (!strictOnly || d.strictOnly) &&
      (q === '' || d.name.toLowerCase().includes(q) || d.label.toLowerCase().includes(q)),
  );
  const selected = detectors.find((d) => d.id === selectedId) ?? null;
  const countFor = (category: Category) => detectors.filter((d) => d.category === category).length;

  return (
    <>
      <div className="filters" role="group" aria-label="Filter rules">
        {CATEGORY_FILTERS.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`filter-chip ${c.id === 'all' ? 'filter-all' : `filter-${c.id}`} ${filter === c.id ? 'is-active' : ''}`}
            aria-pressed={filter === c.id}
            onClick={() => setFilter(c.id)}
          >
            {c.label} ({c.id === 'all' ? detectors.length : countFor(c.id)})
          </button>
        ))}
        <span className="filter-divider" aria-hidden="true" />
        <button
          type="button"
          className={`filter-chip filter-all ${enabledOnly ? 'is-active' : ''}`}
          aria-pressed={enabledOnly}
          onClick={() => setEnabledOnly((v) => !v)}
        >
          Enabled
        </button>
        <button
          type="button"
          className={`filter-chip filter-all ${strictOnly ? 'is-active' : ''}`}
          aria-pressed={strictOnly}
          onClick={() => setStrictOnly((v) => !v)}
        >
          Strict
        </button>
      </div>
      {visible.length === 0 && (
        <p className="muted rules-empty">No rules match the current search and filters.</p>
      )}
      <div className={`rules-layout ${selected ? 'has-detail' : ''}`}>
        <ul className="rule-list" aria-label="Rules">
          {visible.map((d) => (
            <li key={d.id} className={`rule-row ${selectedId === d.id ? 'is-selected' : ''}`}>
              <button
                type="button"
                className="rule-row-button"
                onClick={() => setSelectedId(selectedId === d.id ? null : d.id)}
                aria-expanded={selectedId === d.id}
              >
                <span className="rule-name">
                  {d.name}
                  {d.strictOnly && <span className="chip chip-strict">Strict</span>}
                  {packsForDetector(d.id).map((p) => (
                    <span key={p.id} className="chip chip-pack" title={p.name}>
                      {PACK_BADGES[p.id] ?? p.region}
                    </span>
                  ))}
                </span>
                <span className={`chip chip-cat-${d.category}`}>{d.category}</span>
                <span className={`chip chip-${d.severity}`}>{d.severity}</span>
                <span className="muted rule-confidence">{CONFIDENCE_SHORT[d.id]} confidence</span>
                <code className="placeholder-code">[{d.label}]</code>
              </button>
              <label className="switch">
                <input
                  type="checkbox"
                  role="switch"
                  checked={resolvedStates[d.id] ?? false}
                  onChange={(e) => onToggleRule(d.id, e.target.checked)}
                  aria-label={`Enable rule ${d.name}`}
                />
                <span className="switch-track" aria-hidden="true" />
              </label>
            </li>
          ))}
        </ul>
        {selected && (
          <RuleDetail
            detector={selected}
            resolvedStates={resolvedStates}
            format={format}
            onToggleRule={onToggleRule}
          />
        )}
      </div>
    </>
  );
}

export function RulesSection({
  workspace,
  resolvedStates,
  activeConfig,
  onToggleRule,
}: SettingsProps) {
  const [query, setQuery] = useState('');
  const isNamedProfile = !activeConfig.builtIn && activeConfig.id !== 'unsaved';

  return (
    <section className="panel settings-panel" aria-label="Detection rules">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Detection Rules</h2>
          <span className="muted">
            {detectors.length} rules · {Object.values(resolvedStates).filter(Boolean).length}{' '}
            enabled in {activeConfig.name}
          </span>
        </div>
        <input
          type="search"
          className="rule-search"
          placeholder="Search rules…"
          aria-label="Search rules"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
        />
      </div>
      <div className={`profile-edit-context ${isNamedProfile ? 'is-named' : ''}`}>
        <div>
          <strong>
            {isNamedProfile
              ? `Editing profile: ${activeConfig.name}`
              : activeConfig.builtIn
                ? `Built-in profile: ${activeConfig.name}`
                : 'Editing unsaved configuration'}
          </strong>
          <span className="muted">
            {isNamedProfile
              ? workspace.remember
                ? 'Rule changes are saved to this profile on this device automatically.'
                : 'Rule changes stay with this profile for this session. Turn on Remember preferences to keep them after closing.'
              : activeConfig.builtIn
                ? 'Changing a rule creates an unsaved configuration so this preset stays unchanged.'
                : 'Create a named profile in Profiles & Packs if you want to keep this configuration.'}
          </span>
        </div>
        <a className="btn btn-mini" href="#/settings/profiles">
          {isNamedProfile ? 'Done editing' : 'Profiles & Packs'}
        </a>
      </div>
      <RuleBrowser
        query={query}
        resolvedStates={resolvedStates}
        format={activeConfig.format}
        onToggleRule={onToggleRule}
      />
    </section>
  );
}

function RuleDetail({
  detector,
  resolvedStates,
  format,
  onToggleRule,
}: {
  detector: Detector;
  resolvedStates: Record<string, boolean>;
  format: SettingsProps['activeConfig']['format'];
  onToggleRule: SettingsProps['onToggleRule'];
}) {
  const info = RULE_INFO[detector.id];
  const enabled = resolvedStates[detector.id] ?? false;

  // Replacement preview: scan the synthetic sample with ONLY this rule active,
  // using the active profile's redaction format.
  const preview = useMemo(() => {
    if (!info) return null;
    const findings = scanText(info.sample, {
      enabledDetectorIds: [detector.id],
      placeholderTemplate: templateFor(format),
    });
    return { before: info.sample, after: buildCleanText(info.sample, findings) };
  }, [detector.id, info, format]);

  return (
    <aside className="rule-detail" aria-label={`Rule details: ${detector.name}`}>
      <div className="rule-detail-head">
        <h3>{detector.name}</h3>
        <label className="switch">
          <input
            type="checkbox"
            role="switch"
            checked={enabled}
            onChange={(e) => onToggleRule(detector.id, e.target.checked)}
            aria-label={`Enable rule ${detector.name} (detail)`}
          />
          <span className="switch-track" aria-hidden="true" />
        </label>
      </div>
      <p className="muted">{detector.explanation}</p>
      {(detector.id === 'person-name' || detector.id === 'org-name') && (
        <p className="muted rule-coverage-note" role="note" data-testid="name-coverage-note">
          CloakGuard may not find every name or organization — this rule only detects values with
          recognizable context. For anything it misses, add the exact words with{' '}
          <strong>Hide custom terms</strong> on the Scan screen, or keep a reusable{' '}
          <a href="#/settings/profiles">Cloak List</a>.
        </p>
      )}
      {info && (
        <>
          <h4>What it detects</h4>
          <p className="muted">{info.detects}</p>
          <h4>False positives</h4>
          <p className="muted">{info.falsePositives}</p>
          <h4>Confidence</h4>
          <p className="muted">{info.confidence}</p>
          {preview && (
            <>
              <h4>Replacement preview</h4>
              <div className="rule-preview">
                <code className="rule-preview-before">{preview.before}</code>
                <span className="arrow" aria-hidden="true">
                  →
                </span>
                <code className="rule-preview-after">{preview.after}</code>
              </div>
            </>
          )}
        </>
      )}
    </aside>
  );
}
