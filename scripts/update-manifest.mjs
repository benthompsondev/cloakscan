// Build or validate the multi-platform updater manifest (latest.json).
//
// The Tauri updater reads one latest.json from the newest GitHub release and
// picks its own platform entry. A release that ships only one platform's
// entry silently strands every other platform, so this script makes the
// manifest an explicit, checkable artifact instead of hand-edited JSON:
//
//   - both supported platforms (windows-x86_64, linux-x86_64) are required
//   - URLs must be https and signatures must be non-empty .sig file contents
//   - anything that looks like secret-key material is rejected outright
//   - an existing manifest's entries are preserved, never overwritten
//   - output key order is fixed, so the JSON is deterministic
//
// It only ever touches public data: artifact URLs and detached signature
// contents. It never reads, needs, or prints the private signing key.
//
// Usage:
//   node scripts/update-manifest.mjs --validate latest.json
//   node scripts/update-manifest.mjs \
//     --version 1.1.0 --pub-date 2026-08-01T00:00:00Z --notes "CloakGuard 1.1.0" \
//     --platform windows-x86_64 <artifact-url> <path-to-.sig> \
//     --platform linux-x86_64 <artifact-url> <path-to-.sig> \
//     [--existing previous-latest.json] --out latest.json

import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REQUIRED_PLATFORMS = ['linux-x86_64', 'windows-x86_64'];

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const SECRET_MATERIAL = /private key|secret key/i;

function fail(message) {
  throw new Error(message);
}

/** Validate one platform entry ({ signature, url }). */
export function validateEntry(platform, entry) {
  if (typeof entry !== 'object' || entry === null) {
    fail(`${platform}: entry must be an object with signature and url`);
  }
  const { signature, url } = entry;
  if (typeof url !== 'string' || url.trim() === '') {
    fail(`${platform}: url must be a non-empty string`);
  }
  if (!url.startsWith('https://')) {
    fail(`${platform}: url must be https, got "${url}"`);
  }
  if (typeof signature !== 'string' || signature.trim() === '') {
    fail(`${platform}: signature must be the non-empty contents of the .sig file`);
  }
  if (SECRET_MATERIAL.test(signature)) {
    fail(`${platform}: signature looks like secret-key material — refusing to continue`);
  }
  const extraKeys = Object.keys(entry).filter((key) => key !== 'signature' && key !== 'url');
  if (extraKeys.length > 0) {
    fail(`${platform}: unexpected keys ${extraKeys.join(', ')}`);
  }
}

/** Validate a complete manifest object. Both required platforms must exist. */
export function validateManifest(manifest) {
  if (typeof manifest !== 'object' || manifest === null) fail('manifest must be an object');
  const { version, notes, pub_date: pubDate, platforms } = manifest;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
    fail(`manifest version must be a semantic version, got "${version}"`);
  }
  if (typeof notes !== 'string') fail('manifest notes must be a string (may be empty)');
  if (typeof pubDate !== 'string' || !RFC3339.test(pubDate)) {
    fail(`manifest pub_date must be RFC 3339 (e.g. 2026-08-01T00:00:00Z), got "${pubDate}"`);
  }
  if (typeof platforms !== 'object' || platforms === null) {
    fail('manifest platforms must be an object');
  }
  for (const required of REQUIRED_PLATFORMS) {
    if (!(required in platforms)) {
      fail(`manifest is missing the required platform "${required}"`);
    }
  }
  for (const [platform, entry] of Object.entries(platforms)) {
    validateEntry(platform, entry);
  }
  return manifest;
}

/** Assemble a manifest from explicit values. Requires both platforms. */
export function buildManifest({ version, notes = '', pubDate, platforms }) {
  return validateManifest({ version, notes, pub_date: pubDate, platforms });
}

/**
 * Add platform entries to an existing manifest without ever changing the
 * entries already in it. Overlapping platforms are an error, so a Windows
 * entry that already shipped can never be silently replaced.
 */
export function mergeManifest(existing, additions) {
  if (typeof existing !== 'object' || existing === null) fail('existing manifest must be an object');
  if (typeof existing.platforms !== 'object' || existing.platforms === null) {
    fail('existing manifest has no platforms object');
  }
  for (const platform of Object.keys(additions)) {
    if (platform in existing.platforms) {
      fail(`platform "${platform}" already exists in the manifest — refusing to overwrite it`);
    }
    validateEntry(platform, additions[platform]);
  }
  return validateManifest({
    version: existing.version,
    notes: existing.notes ?? '',
    pub_date: existing.pub_date,
    platforms: { ...existing.platforms, ...additions },
  });
}

/** Deterministic JSON: fixed top-level order, sorted platforms, LF, newline at EOF. */
export function renderManifest(manifest) {
  validateManifest(manifest);
  const ordered = {
    version: manifest.version,
    notes: manifest.notes,
    pub_date: manifest.pub_date,
    platforms: Object.fromEntries(
      Object.keys(manifest.platforms)
        .sort()
        .map((platform) => [
          platform,
          {
            signature: manifest.platforms[platform].signature,
            url: manifest.platforms[platform].url,
          },
        ]),
    ),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function parseArgs(argv) {
  const options = { platforms: {} };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    switch (arg) {
      case '--validate':
        options.validate = argv[++index];
        break;
      case '--version':
        options.version = argv[++index];
        break;
      case '--notes':
        options.notes = argv[++index];
        break;
      case '--pub-date':
        options.pubDate = argv[++index];
        break;
      case '--existing':
        options.existing = argv[++index];
        break;
      case '--out':
        options.out = argv[++index];
        break;
      case '--platform': {
        const platform = argv[++index];
        const url = argv[++index];
        const sigPath = argv[++index];
        if (!platform || !url || !sigPath) {
          fail('--platform needs three values: <name> <url> <path-to-.sig>');
        }
        options.platforms[platform] = {
          url,
          signature: readFileSync(sigPath, 'utf8').trim(),
        };
        break;
      }
      default:
        fail(`unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.validate) {
    validateManifest(JSON.parse(readFileSync(options.validate, 'utf8')));
    console.log(`${options.validate} is a valid multi-platform manifest.`);
    return;
  }

  let manifest;
  if (options.existing) {
    const existing = JSON.parse(readFileSync(options.existing, 'utf8'));
    manifest = mergeManifest(existing, options.platforms);
  } else {
    manifest = buildManifest({
      version: options.version,
      notes: options.notes ?? '',
      pubDate: options.pubDate,
      platforms: options.platforms,
    });
  }

  const rendered = renderManifest(manifest);
  if (options.out) {
    writeFileSync(options.out, rendered);
    // Log platform names only — never signature contents.
    console.log(
      `Wrote ${options.out} for v${manifest.version} with platforms: ${Object.keys(
        manifest.platforms,
      )
        .sort()
        .join(', ')}`,
    );
  } else {
    process.stdout.write(rendered);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
