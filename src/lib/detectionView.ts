/** A detection-only view. Output always uses the untouched source and mapped spans. */
export function detectionView(source: string): { text: string; offsets: number[] } | null {
  if (!/[\u00a0\u2000-\u200a\u202f\u205f\u3000\uff01-\uff5e]|\\(?:\/|u[0-9a-fA-F]{4})/.test(source)) return null;
  const chars: string[] = [];
  const offsets: number[] = [];
  let quoted = false;
  for (let at = 0; at < source.length;) {
    const start = at;
    let char = source[at++];
    if (char === '"') quoted = !quoted;
    if (quoted && char === '\\' && at < source.length) {
      const next = source[at];
      const hex = next === 'u' ? source.slice(at + 1, at + 5) : '';
      const decoded = /^[0-9a-fA-F]{4}$/.test(hex) ? String.fromCharCode(parseInt(hex, 16)) : '';
      // Decode URL slashes and unreserved ASCII only. Decoding quote/control
      // escapes would invent string boundaries and risk partial redaction.
      if (next === '/') { char = '/'; at += 1; }
      else if (/^[A-Za-z0-9_.~-]$/.test(decoded)) { char = decoded; at += 5; }
      else {
        offsets.push(start, at);
        chars.push(char, next);
        at += 1;
        continue;
      }
    }
    if (/[\u00a0\u2000-\u200a\u202f\u205f\u3000]/.test(char)) char = ' ';
    else if (/[\uff01-\uff5e]/.test(char)) char = String.fromCharCode(char.charCodeAt(0) - 0xfee0);
    offsets.push(start);
    chars.push(char);
  }
  offsets.push(source.length);
  const text = chars.join('');
  return text === source ? null : { text, offsets };
}
