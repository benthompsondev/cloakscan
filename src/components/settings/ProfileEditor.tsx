import { useEffect, useRef, useState } from 'react';
import { detectors } from '../../lib/detectors';
import { BUILT_IN_PACKS } from '../../lib/packs';
import {
  enabledRuleIds,
  resolveRuleStates,
  validateName,
  type CoreMode,
  type ProfileConfig,
} from '../../lib/profiles';
import { isCloakList, type CustomPack } from '../../lib/customPacks';
import { validateTemplate } from '../../lib/redaction';
import { RuleBrowser } from './RulesSection';
import { FormatPicker } from './FormatsSection';

/** Matches the preference sanitizer's cap in src/lib/preferences.ts. */
const MAX_DESCRIPTION_LENGTH = 200;

interface ProfileEditorProps {
  /** The saved named profile being edited — never a built-in preset. */
  profile: ProfileConfig;
  customPacks: readonly CustomPack[];
  remember: boolean;
  onSave: (profile: ProfileConfig) => void;
  onCancel: () => void;
}

const CORE_MODES: { id: CoreMode; name: string; hint: string }[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    hint: 'The standard detector set. Secrets, infrastructure, identity, and path rules.',
  },
  {
    id: 'strict',
    name: 'Strict',
    hint: 'Everything in Balanced, plus labeled-field PII rules. More findings, more review.',
  },
];

/**
 * Profile Editor: change everything one saved profile does in a single place.
 *
 * Works on a deep-cloned DRAFT — nothing in the workspace changes until Save,
 * Cancel discards every edit, and opening the editor never activates the
 * profile or affects the current scan. Built-in Balanced/Strict presets can
 * never reach this editor. Rule resolution and format validation reuse the
 * same lib functions as the live views (no second registry, no second
 * resolution path).
 */
export function ProfileEditor({
  profile,
  customPacks,
  remember,
  onSave,
  onCancel,
}: ProfileEditorProps) {
  const [draft, setDraft] = useState<ProfileConfig>(() => JSON.parse(JSON.stringify(profile)));
  const [query, setQuery] = useState('');
  const headingRef = useRef<HTMLHeadingElement>(null);

  // The heading receives focus so keyboard and screen-reader users land on
  // the editor context, wherever the packs page was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
    headingRef.current?.focus();
  }, []);

  const nameError = draft.name.length > 0 ? validateName(draft.name) : null;
  const formatError =
    draft.format.id === 'custom' ? validateTemplate(draft.format.customTemplate) : null;
  const canSave = draft.name.trim().length > 0 && nameError === null && formatError === null;

  // Same resolution order as live scanning: Core mode → packs → overrides.
  const resolved = resolveRuleStates(draft, customPacks);
  const effectiveCount = enabledRuleIds(resolved).length;
  const overrideCount = Object.keys(draft.overrides).length;

  const cloakLists = customPacks.filter(isCloakList);
  const advancedPacks = customPacks.filter((p) => !isCloakList(p));

  const toggleRule = (id: string, enabled: boolean) =>
    setDraft((d) => ({ ...d, overrides: { ...d.overrides, [id]: enabled } }));

  const togglePack = (packId: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      packIds: on ? [...new Set([...d.packIds, packId])] : d.packIds.filter((x) => x !== packId),
    }));

  const toggleCustomPack = (packId: string, on: boolean) =>
    setDraft((d) => ({
      ...d,
      customPackIds: on
        ? [...new Set([...d.customPackIds, packId])]
        : d.customPackIds.filter((x) => x !== packId),
    }));

  const save = () => {
    const description = (draft.description ?? '').trim().slice(0, MAX_DESCRIPTION_LENGTH);
    onSave({
      ...draft,
      name: draft.name.trim(),
      description: description.length > 0 ? description : undefined,
    });
  };

  return (
    <section className="panel settings-panel" aria-label="Profile editor">
      <div className="panel-head">
        <div className="panel-title">
          <h2 ref={headingRef} tabIndex={-1}>
            Edit profile: {profile.name}
          </h2>
          <span className="muted">
            {remember
              ? 'Changes apply when you click Save and are kept on this device.'
              : 'Changes apply when you click Save and stay session-only (preference storage is off).'}
          </span>
        </div>
        <div className="panel-actions">
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
            Save profile
          </button>
        </div>
      </div>
      <div className="settings-body">
        <h3>Name & description</h3>
        <div className="pack-editor-grid">
          <label>
            <strong>Profile name</strong>
            <input
              className="rule-search"
              value={draft.name}
              maxLength={40}
              aria-label="Profile name"
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
              maxLength={MAX_DESCRIPTION_LENGTH}
              aria-label="Profile description"
              placeholder="What this profile is for, e.g. sharing logs outside the team"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
            />
          </label>
        </div>

        <h3>Base detection mode</h3>
        <div role="radiogroup" aria-label="Base detection mode" className="profile-list">
          {CORE_MODES.map((mode) => (
            <label
              key={mode.id}
              className={`profile-option ${draft.core === mode.id ? 'is-active' : ''}`}
            >
              <input
                type="radio"
                name="profile-core"
                checked={draft.core === mode.id}
                onChange={() => setDraft({ ...draft, core: mode.id })}
              />
              <span>
                <strong>{mode.name}</strong>
                <span className="muted profile-desc">{mode.hint}</span>
              </span>
            </label>
          ))}
        </div>

        <h3>Country packs</h3>
        <div className="pack-rule-picker">
          {BUILT_IN_PACKS.map((pack) => (
            <label key={pack.id} className="pack-rule-option">
              <input
                type="checkbox"
                checked={draft.packIds.includes(pack.id)}
                onChange={(e) => togglePack(pack.id, e.target.checked)}
                aria-label={`Include pack ${pack.name} in this profile`}
              />
              {pack.name}
            </label>
          ))}
        </div>

        <h3>Custom Packs & Cloak Lists</h3>
        {customPacks.length === 0 ? (
          <p className="muted">
            None yet — create Custom Packs and Cloak Lists in Profiles & Packs, then include them
            here.
          </p>
        ) : (
          <div className="pack-rule-picker">
            {advancedPacks.map((pack) => (
              <label key={pack.id} className="pack-rule-option">
                <input
                  type="checkbox"
                  checked={draft.customPackIds.includes(pack.id)}
                  onChange={(e) => toggleCustomPack(pack.id, e.target.checked)}
                  aria-label={`Include pack ${pack.name} in this profile`}
                />
                {pack.name}
              </label>
            ))}
            {cloakLists.map((list) => (
              <label key={list.id} className="pack-rule-option">
                <input
                  type="checkbox"
                  checked={draft.customPackIds.includes(list.id)}
                  onChange={(e) => toggleCustomPack(list.id, e.target.checked)}
                  aria-label={`Include Cloak List ${list.name} in this profile`}
                />
                {list.name} · Cloak List
              </label>
            ))}
          </div>
        )}

        <h3>Detection rules</h3>
        <div className="setting-row">
          <p className="muted" data-testid="profile-editor-rule-counts">
            {effectiveCount} of {detectors.length} rules enabled · {overrideCount} explicit
            override{overrideCount === 1 ? '' : 's'}
          </p>
          <button
            type="button"
            className="btn btn-mini"
            disabled={overrideCount === 0}
            onClick={() => setDraft((d) => ({ ...d, overrides: {} }))}
          >
            Reset rule overrides
          </button>
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
        <RuleBrowser
          query={query}
          resolvedStates={resolved}
          format={draft.format}
          onToggleRule={toggleRule}
        />

        <h3>Redaction format</h3>
        <FormatPicker
          choice={draft.format}
          onChange={(format) => setDraft((d) => ({ ...d, format }))}
        />
      </div>
    </section>
  );
}
