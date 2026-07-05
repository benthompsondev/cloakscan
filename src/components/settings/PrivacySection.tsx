import { PREFERENCES_STORAGE_KEY_V2 } from '../../lib/preferences';
import type { SettingsProps } from './SettingsView';

export function PrivacySection({ workspace, onSetRemember, onClearPreferences }: SettingsProps) {
  const remember = workspace.remember;
  return (
    <section className="panel settings-panel" aria-label="Privacy settings">
      <div className="panel-head">
        <div className="panel-title">
          <h2>Privacy</h2>
          <span className="muted">Data handling & guarantees</span>
        </div>
      </div>
      <div className="settings-body">
        <h3>Preference storage</h3>
        <div className={`storage-status ${remember ? 'is-on' : ''}`}>
          {remember ? (
            <>
              <strong>Preference storage is ON.</strong> One key (
              <code>{PREFERENCES_STORAGE_KEY_V2}</code>) holds your active profile, named
              profiles, pack selections, custom packs and their labeled-field rules, rule
              overrides, and redaction formats — nothing else. Cloak term values are included
              only for Cloak Lists and packs where you separately opted in, and are readable,
              unencrypted data stored locally on this device.
            </>
          ) : (
            <>
              <strong>Preference storage is OFF.</strong> CloakGuard writes nothing to this device
              — no localStorage, sessionStorage, IndexedDB, or cookies. Named profiles, custom
              packs, Cloak Lists, custom rules, and cloak terms all vanish on reload.
            </>
          )}
        </div>
        <div className="setting-row">
          <label className="switch">
            <input
              type="checkbox"
              role="switch"
              checked={remember}
              onChange={(e) => onSetRemember(e.target.checked)}
              aria-label="Remember preferences on this device (privacy)"
            />
            <span className="switch-track" aria-hidden="true" />
          </label>
          <p className="muted">Remember preferences on this device.</p>
        </div>
        <div className="setting-row">
          <button type="button" className="btn btn-ghost" onClick={onClearPreferences}>
            Clear preferences
          </button>
          <p className="muted">
            Deletes every stored key (current and legacy) including saved profiles, custom packs,
            Cloak Lists, custom rules, and any explicitly saved cloak terms, then returns to
            session-only defaults.
          </p>
        </div>

        <h3>What is never stored</h3>
        <p className="muted">
          Under any setting: source text, imported file contents or filenames, findings, matched
          values, masked previews, sanitized output, custom terms to hide, clipboard content, or any
          scan history. All of it lives in memory only and disappears on refresh or Clear session.
        </p>

        <h3>Why there is no scan history</h3>
        <p className="muted">
          Automated detection can miss sensitive values, so sanitized output may still contain
          something private. Automatically saving results would quietly persist exactly the data
          this tool exists to protect. If history is ever added, it will be a separately reviewed
          feature with explicit per-result saving, warnings, deletion, and retention controls.
        </p>

        <h3>Network</h3>
        <p className="muted">
          Scanning has no backend, upload, or telemetry. In the desktop app, the only network
          feature is <em>Check for updates</em>, which contacts GitHub from the Rust side only when
          you click it. The scanning webview keeps a strict Content Security Policy that blocks
          outbound connection APIs, and an automated test verifies no non-local origin is contacted.
        </p>
      </div>
    </section>
  );
}
