import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Private-key blocks: PEM/PKCS (BEGIN PRIVATE KEY, BEGIN RSA/EC/DSA PRIVATE
 * KEY, BEGIN ENCRYPTED PRIVATE KEY), OpenSSH (BEGIN OPENSSH PRIVATE KEY), and
 * PGP (BEGIN PGP PRIVATE KEY BLOCK). The entire block from BEGIN to END is
 * one finding, so no fragment of key material survives redaction.
 * Only complete blocks match, and the END marker must name the same key type
 * as the BEGIN marker (backreferences \1/\2); a stray or mismatched header is
 * left for manual review.
 */
const PRIVATE_KEY_BLOCK_RE =
  /-----BEGIN ((?:[A-Z0-9]+ )*)PRIVATE KEY( BLOCK)?-----[\s\S]+?-----END \1PRIVATE KEY\2-----/g;

export const privateKeyDetector: Detector = {
  id: 'private-key',
  name: 'Private key block',
  category: 'secrets',
  severity: 'high',
  label: 'PRIVATE_KEY',
  // Highest priority: the block swallows anything detectors would match inside it.
  priority: 97,
  explanation: 'A private key grants whoever holds it the ability to impersonate its owner.',
  detect: (text) => regexMatches(text, PRIVATE_KEY_BLOCK_RE),
};
