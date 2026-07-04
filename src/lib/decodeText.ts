/**
 * Decode imported file bytes to text. PowerShell tooling frequently writes
 * UTF-16LE (with or without BOM), so plain UTF-8 decoding would produce
 * garbage for exactly the files CloakGuard is most useful on.
 *
 * Handles: UTF-8, UTF-8 BOM, UTF-16LE/BE with BOM, and BOM-less UTF-16LE via
 * a NUL-byte heuristic. Returns null when decoding fails.
 */
export function decodeText(bytes: Uint8Array): string | null {
  try {
    if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      return new TextDecoder('utf-8').decode(bytes.subarray(3));
    }
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(bytes.subarray(2));
    }
    if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(bytes.subarray(2));
    }
    // BOM-less heuristic: ASCII-ish UTF-16LE text is ~half NUL bytes.
    const sample = bytes.subarray(0, Math.min(bytes.length, 4096));
    let nulls = 0;
    for (const byte of sample) if (byte === 0) nulls += 1;
    if (sample.length > 0 && nulls > sample.length / 4) {
      return new TextDecoder('utf-16le').decode(bytes);
    }
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}
