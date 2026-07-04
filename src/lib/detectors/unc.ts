import type { Detector } from '../types';
import { regexMatches } from './helpers';

/**
 * UNC network paths, e.g. \\fs01\Deploy$\packages or \\fs01.example.test\share.
 * The server name (and often the share name) is internal infrastructure.
 * '$' is allowed so admin/hidden shares like Share$ are captured.
 */
const UNC_PATH_RE = /\\\\[A-Za-z0-9][A-Za-z0-9._-]{0,253}\\[^\\\s"'<>|]+(?:\\[^\\\s"'<>|]+)*\\?/g;

export const uncPathDetector: Detector = {
  id: 'unc-path',
  name: 'UNC network path',
  category: 'paths',
  severity: 'medium',
  label: 'UNC_PATH',
  priority: 73,
  explanation: 'UNC paths expose internal server and share names.',
  detect: (text) => regexMatches(text, UNC_PATH_RE),
};
