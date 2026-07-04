import { detectors } from '../../lib/detectors';
import { enabledRuleIds, resolveRuleStates } from '../../lib/profiles';
import { APP_VERSION } from '../../lib/version';
import type { SettingsProps } from './SettingsView';

const CORE_PRESETS: { id: 'balanced' | 'strict'; name: string; description: string }[] = [
  {
    id: 'balanced',
    name: 'Balanced',
    description: 'The standard detector set. Secrets, infrastructure, identity, and path rules.',
  },
  {
    id: 'strict',
    name: 'Strict',
    description:
      'Everything in Balanced, plus labeled-field PII rules (names, phones, addresses, birth dates, SINs, health identifiers). More findings, more review.',
  },
];

export function GeneralSection({
  workspace,
  activeConfig,
  onSelectProfile,
  onSetRemember,
  onResetDefaults,
}: SettingsProps) {
  const enabledCount = enabledRuleIds(
    resolveRuleStates(activeConfig, workspace.customPacks),
  ).length;
  const isUnsaved = workspace.activeProfileId === 'unsaved';

  return (
    <section className="panel settings-panel" aria-label="General settings">
      <div className="panel-head">
        <div className="panel-title">
          <h2>General</h2>
        </div>
      </div>
      <div className="settings-body">
        <h3>Core detection mode</h3>
        <div role="radiogroup" aria-label="Detection profile" className="profile-list">
          {CORE_PRESETS.map((p) => (
            <label key={p.id} className={`profile-option ${workspace.activeProfileId === p.id ? 'is-active' : ''}`}>
              <input
                type="radio"
                name="profile"
                checked={workspace.activeProfileId === p.id}
                onChange={() => onSelectProfile(p.id)}
              />
              <span>
                <strong>{p.name}</strong>
                <span className="muted profile-desc">{p.description}</span>
              </span>
            </label>
          ))}
          <div className={`profile-option profile-custom ${isUnsaved ? 'is-active' : ''}`}>
            <input type="radio" name="profile" checked={isUnsaved} readOnly disabled={!isUnsaved} />
            <span>
              <strong>Unsaved configuration</strong>
              <span className="muted profile-desc">
                Created automatically when you enable or disable individual rules or packs while a
                built-in preset is active. Currently {enabledCount} of {detectors.length} rules
                enabled. Named profiles live in Profiles & Packs.
              </span>
            </span>
          </div>
        </div>
        <p className="muted">
          Regional coverage, named profiles, and custom packs are managed in{' '}
          <a href="#/settings/profiles">Profiles & Packs</a>.
        </p>

        <h3>Preferences on this device</h3>
        <div className="setting-row">
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={workspace.remember}
              onChange={(e) => onSetRemember(e.target.checked)}
              aria-label="Remember preferences on this device"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
          <div>
            <strong>Remember preferences on this device</strong>
            <p className="muted">
              Off by default. When on, your profiles, pack selections, custom packs, rule choices,
              and redaction format are stored — never any text, findings, or scan output. Cloak
              term values have their own separate opt-in per Cloak List or pack. See Privacy for
              details.
            </p>
          </div>
        </div>

        <h3>Reset</h3>
        <div className="setting-row">
          <button type="button" className="btn btn-ghost" onClick={onResetDefaults}>
            Reset to defaults
          </button>
          <p className="muted">
            Back to the Balanced preset. Named profiles and custom packs are kept.
          </p>
        </div>

        <h3>About this build</h3>
        <dl className="summary-list settings-info">
          <div className="summary-row">
            <dt>Version</dt>
            <dd>CloakGuard {APP_VERSION}</dd>
          </div>
          <div className="summary-row">
            <dt>Engine</dt>
            <dd>Local, on-device</dd>
          </div>
          <div className="summary-row">
            <dt>Registered rules</dt>
            <dd>{detectors.length}</dd>
          </div>
        </dl>
      </div>
    </section>
  );
}
