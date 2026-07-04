import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * Windows user-profile paths, e.g. C:\Users\alex.demo\AppData\...\run.log.
 * The username segment is what makes these sensitive, so we only target
 * paths under \Users\.
 */
const WINDOWS_USER_PATH_RE = /\b[A-Za-z]:\\Users\\[^\s"'<>|]+/g;

export const windowsPathDetector: Detector = {
  id: 'windows-user-path',
  name: 'Windows user path',
  category: 'paths',
  severity: 'low',
  label: 'FILE_PATH',
  priority: 72,
  explanation: 'Profile paths reveal the local username and machine layout.',
  detect: (text) => regexMatches(text, WINDOWS_USER_PATH_RE),
};

/** Unix home-directory paths, e.g. /home/ademo/deploy/run.log or /Users/ademo. */
const UNIX_USER_PATH_RE = /(?:\/home|\/Users)\/[A-Za-z0-9._-]+(?:\/[^\s"'<>|]*)?/g;

export const unixPathDetector: Detector = {
  id: 'unix-user-path',
  name: 'Unix user path',
  category: 'paths',
  severity: 'low',
  label: 'FILE_PATH',
  priority: 72,
  explanation: 'Home-directory paths reveal the local username and machine layout.',
  detect: (text) => regexMatches(text, UNIX_USER_PATH_RE),
};
