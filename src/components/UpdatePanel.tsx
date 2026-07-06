import { useEffect, useState } from 'react';
import { relaunch } from '@tauri-apps/plugin-process';
import type { Update } from '@tauri-apps/plugin-updater';
import { APP_VERSION } from '../lib/version';
import {
  canSelfUpdate,
  checkForUpdate,
  installUpdate,
  updateErrorMessage,
} from '../lib/updater';

type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'latest' }
  | { kind: 'available'; version: string }
  | { kind: 'installing'; downloaded: number; total?: number }
  | { kind: 'restart' }
  | { kind: 'error'; message: string };

function progressText(downloaded: number, total?: number): string {
  if (!total) return 'Downloading update…';
  const percent = Math.min(100, Math.round((downloaded / total) * 100));
  return `Downloading update… ${percent}%`;
}

export function UpdatePanel() {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' });
  const [pendingUpdate, setPendingUpdate] = useState<Update | null>(null);
  const [supportsSelfUpdate, setSupportsSelfUpdate] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    void canSelfUpdate()
      .then((supported) => {
        if (active) setSupportsSelfUpdate(supported);
      })
      .catch(() => {
        if (active) setSupportsSelfUpdate(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const checkNow = async () => {
    setState({ kind: 'checking' });
    try {
      if (pendingUpdate) await pendingUpdate.close();
      const update = await checkForUpdate();
      setPendingUpdate(update);
      setState(
        update
          ? { kind: 'available', version: update.version }
          : { kind: 'latest' },
      );
    } catch (error) {
      setPendingUpdate(null);
      setState({ kind: 'error', message: updateErrorMessage(error, 'check') });
    }
  };

  const downloadAndInstall = async () => {
    if (!pendingUpdate) return;
    let downloaded = 0;
    let total: number | undefined;
    setState({ kind: 'installing', downloaded });

    try {
      await installUpdate(pendingUpdate, (event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength;
          setState({ kind: 'installing', downloaded, total });
        } else if (event.event === 'Progress') {
          downloaded += event.data.chunkLength;
          setState({ kind: 'installing', downloaded, total });
        } else {
          setState({ kind: 'installing', downloaded: total ?? downloaded, total });
        }
      });
      setState({ kind: 'restart' });
    } catch (error) {
      setState({ kind: 'error', message: updateErrorMessage(error, 'install') });
    }
  };

  return (
    <section className="panel about-update" aria-labelledby="update-title">
      <div>
        <p className="about-eyebrow">Desktop app</p>
        <h2 id="update-title">Updates</h2>
        <p className="muted">
          This is the only feature that connects to the internet, and only when you click it. It
          checks GitHub for a newer release.
        </p>
      </div>

      <div className="update-actions" aria-live="polite">
        {state.kind === 'idle' && (
          <button type="button" className="btn btn-primary" onClick={() => void checkNow()}>
            Check for updates
          </button>
        )}
        {state.kind === 'checking' && <p className="update-status">Checking…</p>}
        {state.kind === 'latest' && (
          <>
            <p className="update-status is-ok">You&apos;re on the latest version (v{APP_VERSION}).</p>
            <button type="button" className="btn btn-ghost" onClick={() => void checkNow()}>
              Check again
            </button>
          </>
        )}
        {state.kind === 'available' && (
          <>
            <p className="update-status">Update available: v{state.version}</p>
            {supportsSelfUpdate === null ? (
              <p className="muted">Checking how this package should be updated…</p>
            ) : supportsSelfUpdate ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => void downloadAndInstall()}
              >
                Download and install
              </button>
            ) : (
              <>
                <p className="muted">
                  This package is updated manually. Download the newer <code>.deb</code> from
                  GitHub and install it over this version.
                </p>
                <a
                  className="btn btn-primary"
                  href="https://github.com/benthompsondev/cloakguard/releases/latest"
                  target="_blank"
                  rel="noreferrer"
                >
                  Open GitHub Releases
                </a>
              </>
            )}
          </>
        )}
        {state.kind === 'installing' && (
          <p className="update-status">{progressText(state.downloaded, state.total)}</p>
        )}
        {state.kind === 'restart' && (
          <>
            <p className="update-status is-ok">The update is installed.</p>
            <button type="button" className="btn btn-primary" onClick={() => void relaunch()}>
              Restart to finish
            </button>
          </>
        )}
        {state.kind === 'error' && (
          <>
            <p className="update-status is-error">{state.message}</p>
            <button type="button" className="btn btn-ghost" onClick={() => void checkNow()}>
              Retry
            </button>
          </>
        )}
      </div>

      <p className="muted update-restart-note">
        {supportsSelfUpdate === false
          ? 'Debian packages are updated manually through the downloaded .deb file.'
          : 'CloakGuard may close while the update is applied.'}
      </p>
    </section>
  );
}
