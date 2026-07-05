/**
 * Built in pieces so public secret scanners do not mistake this deliberately
 * fake detector fixture for a live credential.
 */
export const SYNTHETIC_STRIPE_SHAPED_KEY = ['sk', 'live', 'DEMO00000000000000000000'].join('_');

export const SYNTHETIC_AWS_ACCESS_KEY_ID = ['AKIA', 'IOSFODNN7EXAMPLE'].join('');

export const SYNTHETIC_GITHUB_TOKEN = [
  'ghp',
  'DEMO000000000000000000000000',
].join('_');

export const SYNTHETIC_ANTHROPIC_API_KEY = [
  'sk',
  'ant',
  'api03',
  'DEMO_NOT_REAL_00000000000000000000',
].join('-');

export const SYNTHETIC_BEARER_TOKEN = [
  'eyJhbGciOiJIUzI1NiJ9',
  'eyJkZW1vIjoibm90LXJlYWwifQ',
  'ZmFrZS1zaWduYXR1cmUtbm90LXJlYWw',
].join('.');
