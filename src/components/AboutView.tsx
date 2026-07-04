import { APP_VERSION } from '../lib/version';
import { detectors } from '../lib/detectors';
import { PREFERENCES_STORAGE_KEY_V2 } from '../lib/preferences';
import { ShieldLogo } from './ShieldLogo';

interface AboutViewProps {
  remember: boolean;
  onClearPreferences: () => void;
}

export function AboutView({ remember, onClearPreferences }: AboutViewProps) {
  return (
    <div className="about">
      <div className="page-head about-head">
        <ShieldLogo />
        <div>
          <h1>CloakGuard</h1>
          <p className="muted">
            Local-first text sanitizer · version {APP_VERSION} · {detectors.length} detection rules
            · MIT licensed
          </p>
        </div>
      </div>

      <div className="about-grid">
        <section className="panel settings-panel" aria-label="Privacy model">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Privacy model</h2>
            </div>
          </div>
          <div className="settings-body">
            <ul className="about-list">
              <li>
                <strong>On-device only.</strong> Scanning and sanitization run entirely on this
                device. There is no backend, no account, and no upload — CloakGuard makes no
                remote application requests.
              </li>
              <li>
                <strong>Memory-only content.</strong> Source text, findings, output, and Quick
                Cloak terms vanish on refresh or Clear session. Nothing is written to local
                storage by default.
              </li>
              <li>
                <strong>Opt-in preferences only.</strong>{' '}
                {remember ? (
                  <>
                    Preference storage is currently <strong>ON</strong>: one key (
                    <code>{PREFERENCES_STORAGE_KEY_V2}</code>) holds your profiles, packs, rule
                    choices, and redaction format — never any content. Saved data is plain,
                    unencrypted localStorage.
                  </>
                ) : (
                  <>
                    Preference storage is currently <strong>OFF</strong> — nothing is stored on
                    this device.
                  </>
                )}
              </li>
              <li>
                <strong>Defense-in-depth.</strong> The production build ships a strict Content
                Security Policy that blocks outbound connection APIs; an automated test verifies no
                non-local origin is contacted.
              </li>
              <li>
                <strong>Honest limits.</strong> Automated detection can miss sensitive information.
                Review before sharing.
              </li>
            </ul>
            <div className="setting-row">
              <button type="button" className="btn btn-ghost" onClick={onClearPreferences}>
                Clear preferences
              </button>
              <p className="muted">Deletes the stored preferences key, if present.</p>
            </div>
          </div>
        </section>

        <section className="panel settings-panel" aria-label="Why no scan history">
          <div className="panel-head">
            <div className="panel-title">
              <h2>Why no scan history?</h2>
            </div>
          </div>
          <div className="settings-body">
            <p className="muted">
              Sanitized output can still contain a value the detectors missed. A history feature
              that automatically saves results would quietly persist exactly the data CloakGuard
              exists to protect — so scans are deliberately not saved. If history is revisited, it
              will be a separately reviewed feature with explicit per-result saving, clear warnings,
              deletion, and retention controls.
            </p>
            <p className="muted">
              Detection profiles, rule details, and redaction formats live in{' '}
              <a href="#/settings/general">Settings</a>.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
