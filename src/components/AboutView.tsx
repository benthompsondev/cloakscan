import { APP_VERSION } from '../lib/version';
import { detectors } from '../lib/detectors';
import { PREFERENCES_STORAGE_KEY_V2 } from '../lib/preferences';
import { ShieldLogo } from './ShieldLogo';
import { LocalIcon, OpenSourceIcon, PrivacyIcon } from './StatusIcons';
import { UpdatePanel } from './UpdatePanel';
import { Wordmark } from './Wordmark';

interface AboutViewProps {
  remember: boolean;
  isDesktop: boolean;
  onClearPreferences: () => void;
}

const PROJECT_LINKS = [
  ['GitHub', 'https://github.com/benthompsondev/cloakguard'],
  ['Live demo', 'https://benthompsondev.github.io/cloakguard/'],
  ['Changelog', 'https://github.com/benthompsondev/cloakguard/blob/main/CHANGELOG.md'],
  ['Report an issue', 'https://github.com/benthompsondev/cloakguard/issues'],
  ['Security policy', 'https://github.com/benthompsondev/cloakguard/blob/main/SECURITY.md'],
  ['License', 'https://github.com/benthompsondev/cloakguard/blob/main/LICENSE'],
  ['How it works', 'https://github.com/benthompsondev/cloakguard/blob/main/docs/architecture.md'],
] as const;

export function AboutView({ remember, isDesktop, onClearPreferences }: AboutViewProps) {
  return (
    <div className="about">
      <div className="about-hero">
        <ShieldLogo />
        <div>
          <h1>
            <Wordmark />
          </h1>
          <p className="muted">
            Version {APP_VERSION} · {detectors.length} detection rules · MIT licensed
          </p>
        </div>
      </div>

      <div className="privacy-pillars" aria-label="Privacy highlights">
        <article className="privacy-pillar">
          <span className="privacy-pillar-icon">
            <LocalIcon className="about-icon" />
          </span>
          <div>
            <h2>Local scanning</h2>
            <p>Text is scanned and cleaned on this device. It is never uploaded.</p>
          </div>
        </article>
        <article className="privacy-pillar">
          <span className="privacy-pillar-icon">
            <PrivacyIcon className="about-icon" />
          </span>
          <div>
            <h2>Memory-only content</h2>
            <p>Source text, findings, and cleaned output disappear when the session is cleared.</p>
          </div>
        </article>
        <article className="privacy-pillar">
          <span className="privacy-pillar-icon">
            <OpenSourceIcon className="about-icon" />
          </span>
          <div>
            <h2>Open source</h2>
            <p>The scanning rules and privacy boundaries can be inspected on GitHub.</p>
          </div>
        </article>
      </div>

      <div className={`about-content ${isDesktop ? '' : 'is-web'}`.trim()}>
        <section className="panel about-privacy" aria-labelledby="privacy-model-title">
          <div className="panel-head">
            <div className="panel-title">
              <h2 id="privacy-model-title">Privacy model</h2>
            </div>
          </div>
          <div className="settings-body">
            <ul className="about-list">
              <li>
                <strong>No content leaves the scanner.</strong> There is no account, backend,
                telemetry, or upload.
              </li>
              <li>
                <strong>Hide custom terms is session-only.</strong> Source text, findings, output,
                and those terms vanish on refresh or <em>Clear session</em>.
              </li>
              <li>
                <strong>Preferences are opt-in.</strong>{' '}
                {remember ? (
                  <>
                    Storage is currently <strong>ON</strong>. One key (
                    <code>{PREFERENCES_STORAGE_KEY_V2}</code>) holds allowlisted settings, never
                    scan content. Saved values are plain, unencrypted local data.
                  </>
                ) : (
                  <>
                    Storage is currently <strong>OFF</strong>. No CloakGuard preferences are saved
                    on this device.
                  </>
                )}
              </li>
              <li>
                <strong>Update checks are click-only.</strong> In the desktop app, checking for an
                update contacts GitHub from the Rust side. It sends no content or telemetry. The
                scanning webview remains blocked from making outbound connections.
              </li>
              <li>
                <strong>Detection has limits.</strong> Automated rules can miss sensitive
                information. Review the cleaned text before sharing it.
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

        {isDesktop && <UpdatePanel />}
      </div>

      <nav className="about-links" aria-label="Project links">
        {PROJECT_LINKS.map(([label, href]) => (
          <a key={label} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>
        ))}
      </nav>
    </div>
  );
}
