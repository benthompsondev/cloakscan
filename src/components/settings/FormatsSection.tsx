import { useMemo } from 'react';
import {
  FORMAT_PRESETS,
  templateFor,
  validateTemplate,
  type RedactionChoice,
} from '../../lib/redaction';
import { scanText } from '../../lib/scan';
import { buildCleanText } from '../../lib/sanitize';
import type { SettingsProps } from './SettingsView';

/** Synthetic sample used for the live output preview. */
const PREVIEW_SAMPLE =
  'Contact alex.demo@example.internal or bea.demo@example.internal from 10.42.16.28';

/**
 * The redaction-format controls with the synthetic live preview. Shared
 * between the Redaction Formats page (editing the ACTIVE configuration) and
 * the Profile Editor (editing a DRAFT). Templates stay {TYPE}/{INDEX}-only —
 * there is no token for the matched value, so it can never appear in output.
 */
export function FormatPicker({
  choice,
  onChange,
}: {
  choice: RedactionChoice;
  onChange: (choice: RedactionChoice) => void;
}) {
  const templateError =
    choice.id === 'custom' ? validateTemplate(choice.customTemplate) : null;

  const preview = useMemo(() => {
    const findings = scanText(PREVIEW_SAMPLE, {
      placeholderTemplate: templateFor(choice),
    });
    return buildCleanText(PREVIEW_SAMPLE, findings);
  }, [choice]);

  const select = (id: RedactionChoice['id']) =>
    onChange({ id, customTemplate: choice.customTemplate });

  return (
    <>
      <div role="radiogroup" aria-label="Redaction format" className="profile-list">
        {FORMAT_PRESETS.map((f) => (
          <label key={f.id} className={`profile-option ${choice.id === f.id ? 'is-active' : ''}`}>
            <input
              type="radio"
              name="format"
              checked={choice.id === f.id}
              onChange={() => select(f.id)}
            />
            <span>
              <strong>{f.name}</strong>
              <span className="muted profile-desc">{f.description}</span>
            </span>
          </label>
        ))}
      </div>

      {choice.id === 'custom' && (
        <div className="template-editor">
          <label htmlFor="custom-template">
            <strong>Custom template</strong>
          </label>
          <input
            id="custom-template"
            type="text"
            className="template-input"
            value={choice.customTemplate}
            maxLength={40}
            spellCheck={false}
            onChange={(e) => onChange({ id: 'custom', customTemplate: e.target.value })}
          />
          {templateError ? (
            <p className="template-error" role="alert">
              {templateError}
            </p>
          ) : (
            <p className="muted">
              Tokens: {'{TYPE}'} is the rule label, {'{INDEX}'} the per-type number. Plain text —
              the original value can never appear in output.
            </p>
          )}
        </div>
      )}

      <h3>Live preview (synthetic data)</h3>
      <div className="format-preview">
        <code className="rule-preview-before">{PREVIEW_SAMPLE}</code>
        <span className="arrow" aria-hidden="true">
          →
        </span>
        <code className="rule-preview-after">{preview}</code>
      </div>
    </>
  );
}

export function FormatsSection({ activeConfig, onChangeFormat }: SettingsProps) {
  return (
    <section className="panel settings-panel" aria-label="Redaction formats">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Redaction Formats</h2>
          <span className="muted">How placeholders appear in cleaned output</span>
        </div>
      </div>
      <div className="settings-body">
        <FormatPicker choice={activeConfig.format} onChange={onChangeFormat} />
        <p className="muted">
          Formats belong to the active profile ({activeConfig.name}) — multiple active packs
          cannot own conflicting output formats.
        </p>
        <p className="muted">
          Placeholder reuse stays deterministic in every format: identical values always map to the
          same placeholder within a scan.
        </p>
      </div>
    </section>
  );
}
