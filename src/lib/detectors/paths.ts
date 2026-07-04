import type { Detector, RawMatch } from '../types';
import { regexMatches } from './helpers';

/**
 * Windows absolute paths. Quoted paths may contain spaces. Unquoted paths
 * stop at a known file extension, the next PowerShell assignment, or the
 * first whitespace when there is no clear path context.
 */
const WINDOWS_PATH_START_RE = /\b[A-Za-z]:\\/g;
const KNOWN_FILE_EXTENSION_RE =
  /\.(?:ps1|psm1|psd1|txt|csv|log|json|xml|ini|config|conf|yaml|yml|exe|msi|dll|zip|bat|cmd)\b/gi;
const PATH_CONTEXT_RE =
  /\b(?:source|destination|target|input|output|path|file|folder|directory|root|script|profile|install|log)(?:[ _-]?(?:path|file|folder|directory))?\b[ \t]*[:=][ \t]*["']?$/i;

function firstIndex(value: string, patterns: RegExp[]): number {
  const indexes = patterns
    .map((pattern) => {
      const match = pattern.exec(value);
      return match?.index ?? -1;
    })
    .filter((index) => index >= 0);
  return indexes.length > 0 ? Math.min(...indexes) : value.length;
}

function findWindowsPaths(text: string): RawMatch[] {
  const matches: RawMatch[] = [];
  const startRe = new RegExp(WINDOWS_PATH_START_RE.source, WINDOWS_PATH_START_RE.flags);
  let startMatch: RegExpExecArray | null;

  while ((startMatch = startRe.exec(text)) !== null) {
    const start = startMatch.index;
    const lineStart = Math.max(text.lastIndexOf('\n', start - 1) + 1, 0);
    const cr = text.indexOf('\r', start);
    const lf = text.indexOf('\n', start);
    const lineEnd = Math.min(
      cr < 0 ? text.length : cr,
      lf < 0 ? text.length : lf,
    );
    const prefix = text.slice(lineStart, start);
    const previous = text[start - 1];

    let end: number;
    if (previous === '"' || previous === "'") {
      const close = text.indexOf(previous, start);
      end = close >= 0 && close <= lineEnd ? close : lineEnd;
    } else {
      const remainder = text.slice(start, lineEnd);
      const hardStop = firstIndex(remainder, [
        /["'<>|?*]/,
        /;/,
        /[ \t]+\$[A-Za-z_][A-Za-z0-9_]*[ \t]*=/,
      ]);
      let candidate = remainder.slice(0, hardStop).trimEnd();

      if (/[ \t]/.test(candidate)) {
        const extensionRe = new RegExp(
          KNOWN_FILE_EXTENSION_RE.source,
          KNOWN_FILE_EXTENSION_RE.flags,
        );
        let extension: RegExpExecArray | null;
        let extensionEnd = -1;
        while ((extension = extensionRe.exec(candidate)) !== null) {
          const after = candidate[extension.index + extension[0].length];
          if (after === undefined || /[ \t,)\]}]/.test(after)) {
            extensionEnd = extension.index + extension[0].length;
            break;
          }
        }
        if (extensionEnd >= 0) {
          candidate = candidate.slice(0, extensionEnd);
        } else if (!PATH_CONTEXT_RE.test(prefix)) {
          candidate = candidate.slice(0, candidate.search(/[ \t]/));
        }
      }
      end = start + candidate.replace(/[ \t,)\]}]+$/, '').length;
    }

    const value = text.slice(start, end);
    // A drive root (C:\) alone is not useful, and registry providers do not
    // match because they do not begin with a drive-letter path.
    if (value.length > 3) {
      matches.push({ start, end, value, confidence: 'high' });
    }
    if (startRe.lastIndex <= start) startRe.lastIndex = start + 1;
  }
  return matches;
}

export const windowsPathDetector: Detector = {
  id: 'windows-user-path',
  name: 'Windows file path',
  category: 'paths',
  severity: 'low',
  label: 'FILE_PATH',
  priority: 72,
  explanation: 'Absolute paths can reveal usernames, private folder names, and machine layout.',
  detect: findWindowsPaths,
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
