import { check, type DownloadEvent, type Update } from '@tauri-apps/plugin-updater';
import { APP_VERSION } from './version';

interface ParsedVersion {
  core: [number, number, number];
  prerelease: string[] | null;
}

function parseVersion(value: string): ParsedVersion {
  const withoutPrefix = value.trim().replace(/^v/i, '');
  const buildIndex = withoutPrefix.indexOf('+');
  const withoutBuild = buildIndex === -1 ? withoutPrefix : withoutPrefix.slice(0, buildIndex);
  const prereleaseIndex = withoutBuild.indexOf('-');
  const coreText =
    prereleaseIndex === -1 ? withoutBuild : withoutBuild.slice(0, prereleaseIndex);
  const prereleaseText =
    prereleaseIndex === -1 ? undefined : withoutBuild.slice(prereleaseIndex + 1);
  const coreParts = coreText.split('.');

  if (coreParts.length !== 3 || coreParts.some((part) => !/^\d+$/.test(part))) {
    throw new Error(`Invalid semantic version: ${value}`);
  }

  return {
    core: coreParts.map(Number) as [number, number, number],
    prerelease: prereleaseText ? prereleaseText.split('.') : null,
  };
}

function comparePrerelease(left: string[] | null, right: string[] | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    if (a === b) continue;

    const aNumber = /^\d+$/.test(a) ? Number(a) : null;
    const bNumber = /^\d+$/.test(b) ? Number(b) : null;
    if (aNumber !== null && bNumber !== null) return Math.sign(aNumber - bNumber);
    if (aNumber !== null) return -1;
    if (bNumber !== null) return 1;
    return a.localeCompare(b);
  }

  return 0;
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);

  for (let index = 0; index < a.core.length; index += 1) {
    if (a.core[index] !== b.core[index]) {
      return Math.sign(a.core[index] - b.core[index]);
    }
  }

  return comparePrerelease(a.prerelease, b.prerelease);
}

export async function checkForUpdate(): Promise<Update | null> {
  const update = await check({ timeout: 15_000 });
  if (update && compareVersions(update.version, APP_VERSION) <= 0) {
    await update.close();
    return null;
  }
  return update;
}

export async function installUpdate(
  update: Update,
  onEvent: (event: DownloadEvent) => void,
): Promise<void> {
  await update.downloadAndInstall(onEvent, { timeout: 120_000 });
}

export function updateErrorMessage(error: unknown, action: 'check' | 'install'): string {
  const detail = error instanceof Error ? error.message : String(error);

  if (/signature|public key|key id|verify/i.test(detail)) {
    return 'The update signature could not be verified. Nothing was installed.';
  }

  if (/network|fetch|dns|connection|timed? ?out|http|404|release json/i.test(detail)) {
    return 'GitHub could not be reached for update information. Check your connection and try again.';
  }

  return action === 'check'
    ? 'CloakGuard could not check for updates. Please try again.'
    : 'CloakGuard could not install the update. Nothing was changed.';
}
