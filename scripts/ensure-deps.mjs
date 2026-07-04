/**
 * Cross-platform dependency check used by the launch scripts.
 *
 * Compares a SHA-256 hash of package-lock.json against a stamp written inside
 * node_modules after the last successful install. A missing node_modules,
 * missing stamp, or changed lockfile all trigger `npm ci`; an in-sync install
 * is a no-op. Never needs admin rights and never installs Node itself.
 */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const lockPath = join(projectRoot, 'package-lock.json');
const stampPath = join(projectRoot, 'node_modules', '.cloakguard-lock.sha256');

if (!existsSync(lockPath)) {
  console.error('package-lock.json not found — is this a complete checkout?');
  process.exit(1);
}

const lockHash = createHash('sha256').update(readFileSync(lockPath)).digest('hex');
const stamped = existsSync(stampPath) ? readFileSync(stampPath, 'utf8').trim() : '';

if (stamped === lockHash) {
  console.log('Dependencies are in sync.');
  process.exit(0);
}

console.log(
  stamped === ''
    ? 'Dependencies not installed yet — running npm ci (one-time)...'
    : 'package-lock.json changed — refreshing dependencies with npm ci...',
);

// A single command string (no args array) keeps Windows happy: npm is
// npm.cmd there, which Node will only spawn through a shell.
const result = spawnSync('npm ci', {
  cwd: projectRoot,
  stdio: 'inherit',
  shell: true,
});

if (result.status !== 0) {
  console.error('npm ci failed — see the output above.');
  process.exit(result.status ?? 1);
}

writeFileSync(stampPath, lockHash);
console.log('Dependencies installed.');
