import { invoke } from '@tauri-apps/api/core';
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

/** At most this many lines, so the panel stays a summary rather than a page. */
const MAX_SUMMARY_ITEMS = 4;
/** Long enough for one full sentence of release notes, short enough to skim. */
const MAX_SUMMARY_LENGTH = 200;

/** Markdown inline syntax reduced to the words a person actually wants to read. */
function plainText(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text: string): string {
  if (text.length <= MAX_SUMMARY_LENGTH) return text;
  const cut = text.slice(0, MAX_SUMMARY_LENGTH);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

/**
 * Turn a release body into a few readable lines for the update panel.
 *
 * The text comes from the `notes` field of the signed update manifest, which
 * CloakScan already downloads to learn the version, so showing it costs no
 * extra request. Release bodies are Markdown and can be long, so headings,
 * code fences, tables, HTML, and link syntax are dropped and only the first
 * few bullets or sentences survive. Anything unusable returns an empty list
 * and the panel simply omits the section.
 */
export function summarizeReleaseNotes(body: string | null | undefined): string[] {
  if (typeof body !== 'string') return [];

  const stripped = body
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/~~~[\s\S]*?~~~/g, ' ')
    // An unterminated fence opens a block that never closes: drop the rest
    // rather than letting raw commands through as if they were prose.
    .replace(/(?:```|~~~)[\s\S]*$/, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]*>/g, ' ');

  const bullets: string[] = [];
  const prose: string[] = [];
  // Release notes are usually hard-wrapped, so a bullet continues onto the
  // following plain lines until a blank line or another block starts. Without
  // this, every wrapped bullet was cut at the first line break.
  let openBullet = -1;

  for (const rawLine of stripped.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) {
      openBullet = -1;
      continue;
    }
    if (
      /^#{1,6}\s/.test(line) || // heading
      /^([-*_])\1{2,}$/.test(line.replace(/\s/g, '')) || // horizontal rule
      line.startsWith('|') || // table row
      line.startsWith('>') // block quote
    ) {
      openBullet = -1;
      continue;
    }

    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line);
    if (bullet) {
      const item = plainText(bullet[1]);
      if (item) openBullet = bullets.push(item) - 1;
      else openBullet = -1;
      continue;
    }

    const text = plainText(line);
    if (!text) continue;
    if (openBullet >= 0) bullets[openBullet] = `${bullets[openBullet]} ${text}`;
    else prose.push(text);
  }

  const items =
    bullets.length > 0
      ? bullets
      : prose
          .join(' ')
          .split(/(?<=[.!?])\s+/)
          .map((part) => part.trim())
          .filter(Boolean);

  return items.slice(0, MAX_SUMMARY_ITEMS).map(truncate);
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

export async function canSelfUpdate(): Promise<boolean> {
  return invoke<boolean>('can_self_update');
}

export function updateErrorMessage(error: unknown, action: 'check' | 'install'): string {
  const detail = error instanceof Error ? error.message : String(error);

  if (/signature|public key|key id|verify/i.test(detail)) {
    return 'The update signature could not be verified. Nothing was installed.';
  }

  // The current platform has no entry in the release manifest — e.g. a Linux
  // build checking a release that only published a Windows artifact. Retrying
  // never helps, so say so honestly and point to the releases page instead.
  if (
    /platform.*(was )?not found|not found on the response|none of the fallback platforms.*were found|no (matching )?platform|unsupported platform|target.*not (found|available)/i.test(
      detail,
    )
  ) {
    return 'No desktop update is published for this platform yet. Check the releases page on GitHub for the latest download.';
  }

  if (/network|fetch|dns|connection|timed? ?out|http|404|release json/i.test(detail)) {
    return 'GitHub could not be reached for update information. Check your connection and try again.';
  }

  return action === 'check'
    ? 'CloakScan could not check for updates. Please try again.'
    : 'CloakScan could not install the update. Nothing was changed.';
}
