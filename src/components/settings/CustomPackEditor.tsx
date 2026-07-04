import { useEffect, useState } from 'react';
import { detectors } from '../../lib/detectors';
import { generateId, validateName } from '../../lib/profiles';
import {
  MAX_RULES_PER_PACK,
  createFieldRuleDetector,
  customPackSaveBlocker,
  emptyPackTerms,
  scanFieldRule,
  validateCustomRule,
  type CustomFieldRule,
  type CustomPack,
  type CustomValueType,
} from '../../lib/customPacks';
import { analyzePrivateTerms } from '../../lib/customTerms';
import { scanText } from '../../lib/scan';
import { buildCleanText } from '../../lib/sanitize';
import { TermsFeedback } from '../TermsFeedback';
import type { Category, Severity } from '../../lib/types';

interface CustomPackEditorProps {
  pack: CustomPack | null; // null = create new
  remember: boolean;
  onSave: (pack: CustomPack) => void;
  onCancel: () => void;
}

function emptyRule(): CustomFieldRule {
  return {
    id: generateId('rule'),
    name: '',
    labels: [''],
    valueType: 'identifier',
    placeholderLabel: 'CUSTOM_ID',
    category: 'personal',
    severity: 'medium',
    maxLength: 40,
    enabled: true,
  };
}

export function CustomPackEditor({ pack, remember, onSave, onCancel }: CustomPackEditorProps) {
  const [draft, setDraft] = useState<CustomPack>(
    pack
      ? JSON.parse(JSON.stringify(pack))
      : {
          id: generateId('pack'),
          name: '',
          description: '',
          detectorIds: [],
          rules: [],
          terms: emptyPackTerms(),
          enabled: true,
        },
  );
  const [termsText, setTermsText] = useState(draft.terms.values.join('\n'));
  const [editingRule, setEditingRule] = useState<CustomFieldRule | null>(null);

  // The editor header (title, privacy status, Cancel/Save) must be visible
  // immediately, wherever the packs page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const nameError = draft.name.length > 0 ? validateName(draft.name) : null;
  // An advanced pack must actually detect something: at least one registry
  // rule or one labeled-field rule. Terms-only collections are Cloak Lists.
  const saveBlocker = customPackSaveBlocker(draft.detectorIds.length, draft.rules.length);
  const canSave =
    draft.name.trim().length > 0 && nameError === null && editingRule === null && saveBlocker === null;

  const save = () => {
    const termAnalysis = analyzePrivateTerms(termsText, draft.terms.caseSensitive);
    onSave({
      ...draft,
      name: draft.name.trim(),
      terms: { ...draft.terms, values: termAnalysis.terms },
    });
  };

  const toggleDetector = (id: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      detectorIds: on ? [...new Set([...d.detectorIds, id])] : d.detectorIds.filter((x) => x !== id),
    }));

  const saveRule = (rule: CustomFieldRule) => {
    setDraft((d) => ({
      ...d,
      rules: d.rules.some((r) => r.id === rule.id)
        ? d.rules.map((r) => (r.id === rule.id ? rule : r))
        : [...d.rules, rule],
    }));
    setEditingRule(null);
  };

  return (
    <section className="panel settings-panel" aria-label="Custom pack editor">
      <div className="panel-head">
        <div className="panel-title">
          <h2>{pack ? `Edit pack: ${pack.name}` : 'Create Custom Pack'}</h2>
          <span className="muted">{remember ? 'Will be saved on this device' : 'Session-only'}</span>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            Save pack
          </button>
        </div>
      </div>
      <div className="settings-body">
        {saveBlocker && (
          <p className="template-error" role="status">
            {saveBlocker}
          </p>
        )}
        <div className="pack-editor-grid">
          <label>
            <strong>Pack name</strong>
            <input
              className="rule-search"
              value={draft.name}
              maxLength={40}
              aria-label="Pack name"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            />
            {nameError && (
              <span className="template-error" role="alert">
                {nameError}
              </span>
            )}
          </label>
          <label>
            <strong>Description (optional)</strong>
            <input
              className="rule-search"
              value={draft.description ?? ''}
              maxLength={200}
              aria-label="Pack description"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>

        <h3>Included registry rules ({draft.detectorIds.length})</h3>
        <div className="pack-rule-picker">
          {detectors.map((d) => (
            <label key={d.id} className="pack-rule-option">
              <input
                type="checkbox"
                checked={draft.detectorIds.includes(d.id)}
                onChange={(e) => toggleDetector(d.id, e.target.checked)}
              />
              {d.name}
            </label>
          ))}
        </div>

        <h3>Custom labeled-field rules ({draft.rules.length})</h3>
        {editingRule === null ? (
          <>
            {draft.rules.length > 0 && (
              <ul className="profile-rows">
                {draft.rules.map((r) => (
                  <li key={r.id} className="profile-row">
                    <span>
                      <strong>{r.name}</strong>{' '}
                      <span className="muted">
                        {r.labels.filter(Boolean).join(', ')} → [{r.placeholderLabel}_n] ·{' '}
                        {r.valueType}
                      </span>
                    </span>
                    <span className="profile-row-actions">
                      <button type="button" className="btn btn-mini" onClick={() => setEditingRule(r)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-mini"
                        onClick={() =>
                          setDraft((d) => ({ ...d, rules: d.rules.filter((x) => x.id !== r.id) }))
                        }
                      >
                        Remove
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="btn btn-ghost"
              disabled={draft.rules.length >= MAX_RULES_PER_PACK}
              onClick={() => setEditingRule(emptyRule())}
            >
              Add labeled-field rule
            </button>
          </>
        ) : (
          <FieldRuleEditor
            rule={editingRule}
            onSave={saveRule}
            onCancel={() => setEditingRule(null)}
          />
        )}

        <h3>Cloak terms for this pack ({analyzePrivateTerms(termsText, draft.terms.caseSensitive).terms.length})</h3>
        <textarea
          className="terms-input"
          rows={4}
          value={termsText}
          aria-label="Pack cloak terms"
          spellCheck={false}
          onChange={(e) => setTermsText(e.target.value)}
          placeholder={'One exact term per line (org names, domains, hostnames…)'}
        />
        <TermsFeedback analysis={analyzePrivateTerms(termsText, draft.terms.caseSensitive)} />
        <div className="terms-toggles">
          <label className="terms-toggle-row">
            <input
              type="checkbox"
              checked={draft.terms.caseSensitive}
              onChange={(e) =>
                setDraft({ ...draft, terms: { ...draft.terms, caseSensitive: e.target.checked } })
              }
            />
            Case-sensitive matching
          </label>
          <label className="terms-toggle-row">
            <input
              type="checkbox"
              checked={draft.terms.matchInsideWords}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  terms: { ...draft.terms, matchInsideWords: e.target.checked },
                })
              }
            />
            Also match inside longer words (more aggressive)
          </label>
        </div>
        <label className="terms-toggle-row terms-save-row">
          <input
            type="checkbox"
            checked={draft.terms.saveTerms}
            onChange={(e) =>
              setDraft({ ...draft, terms: { ...draft.terms, saveTerms: e.target.checked } })
            }
          />
          Save this pack's Cloak terms on this device.
        </label>
        <p className="muted terms-save-warning">
          Saved terms are readable local data on this device and are not encrypted. Nothing is uploaded.
          Clearing preferences deletes saved terms. Without this option (or with preferences off),
          pack terms vanish on reload.
        </p>
      </div>
    </section>
  );
}

function FieldRuleEditor({
  rule,
  onSave,
  onCancel,
}: {
  rule: CustomFieldRule;
  onSave: (rule: CustomFieldRule) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<CustomFieldRule>({ ...rule, labels: [...rule.labels] });
  const [preview, setPreview] = useState('BadgeId: 12345');
  const error = validateCustomRule({ ...draft, labels: draft.labels.filter((l) => l.trim()) });

  const previewResult = (() => {
    const clean = { ...draft, labels: draft.labels.filter((l) => l.trim()) };
    if (validateCustomRule(clean) !== null) return null;
    const detector = createFieldRuleDetector('preview', clean);
    const findings = scanText(preview, { enabledDetectorIds: [], extraDetectors: [detector] });
    return {
      cleaned: buildCleanText(preview, findings),
      skippedTooLong: scanFieldRule(clean, preview).skippedTooLong,
    };
  })();

  return (
    <div className="rule-editor" aria-label="Labeled-field rule editor">
      <div className="pack-editor-grid">
        <label>
          <strong>Rule name</strong>
          <input
            className="rule-search"
            value={draft.name}
            maxLength={40}
            aria-label="Custom rule name"
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          <strong>Placeholder label</strong>
          <input
            className="rule-search"
            value={draft.placeholderLabel}
            maxLength={20}
            aria-label="Placeholder label"
            spellCheck={false}
            onChange={(e) => setDraft({ ...draft, placeholderLabel: e.target.value.toUpperCase() })}
          />
        </label>
      </div>
      <label>
        <strong>Field labels (one per line, max 10)</strong>
        <textarea
          className="terms-input"
          rows={3}
          value={draft.labels.join('\n')}
          aria-label="Field labels"
          spellCheck={false}
          onChange={(e) => setDraft({ ...draft, labels: e.target.value.split('\n').slice(0, 10) })}
        />
      </label>
      <div className="pack-editor-grid pack-editor-grid-4">
        <label>
          <strong>Value type</strong>
          <select
            className="profile-select"
            value={draft.valueType}
            aria-label="Value type"
            onChange={(e) => setDraft({ ...draft, valueType: e.target.value as CustomValueType })}
          >
            <option value="digits">Digits</option>
            <option value="identifier">Identifier</option>
            <option value="text">Same-line text</option>
          </select>
        </label>
        <label>
          <strong>Category</strong>
          <select
            className="profile-select"
            value={draft.category}
            aria-label="Rule category"
            onChange={(e) => setDraft({ ...draft, category: e.target.value as Category })}
          >
            <option value="personal">Personal</option>
            <option value="secrets">Secrets</option>
            <option value="infrastructure">Infrastructure</option>
            <option value="paths">Paths</option>
          </select>
        </label>
        <label>
          <strong>Severity</strong>
          <select
            className="profile-select"
            value={draft.severity}
            aria-label="Rule severity"
            onChange={(e) => setDraft({ ...draft, severity: e.target.value as Severity })}
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </label>
        <label>
          <strong>Max length</strong>
          <input
            className="rule-search"
            type="number"
            min={1}
            max={200}
            value={draft.maxLength}
            aria-label="Maximum captured length"
            onChange={(e) => setDraft({ ...draft, maxLength: Number(e.target.value) })}
          />
        </label>
      </div>
      {error && (
        <p className="template-error" role="alert">
          {error}
        </p>
      )}
      <label>
        <strong>Test with synthetic text</strong>
        <input
          className="rule-search rule-preview-input"
          value={preview}
          aria-label="Synthetic preview text"
          spellCheck={false}
          onChange={(e) => setPreview(e.target.value)}
        />
      </label>
      {previewResult !== null && (
        <>
          <div className="rule-preview">
            <code className="rule-preview-before">{preview}</code>
            <span className="arrow" aria-hidden="true">
              →
            </span>
            <code className="rule-preview-after">{previewResult.cleaned}</code>
          </div>
          {previewResult.skippedTooLong.map((skip, i) => (
            <p key={i} className="muted rule-preview-skip" role="status">
              Skipped a {skip.length}-character value: it exceeds this rule's {draft.maxLength}
              -character limit, so the whole value was left untouched. Over-limit values are never
              partially redacted — raise the limit if this value should be caught.
            </p>
          ))}
        </>
      )}
      <div className="panel-actions">
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Discard rule
        </button>
        <button type="button" className="btn btn-primary" disabled={error !== null} onClick={() => onSave({ ...draft, labels: draft.labels.filter((l) => l.trim()) })}>
          Save rule
        </button>
      </div>
    </div>
  );
}
