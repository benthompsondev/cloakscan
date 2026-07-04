import { describe, expect, it } from 'vitest';
import { decodeText } from './decodeText';

const SAMPLE = '$Server = "dc01.example.test"\r\nWrite-Output "démo"\n';

function utf16le(text: string, bom: boolean): Uint8Array {
  const codeUnits = new Uint16Array([...text].map((c) => c.charCodeAt(0)));
  const bytes = new Uint8Array(codeUnits.buffer.slice(0));
  return bom ? new Uint8Array([0xff, 0xfe, ...bytes]) : bytes;
}

describe('decodeText', () => {
  it('decodes plain UTF-8', () => {
    expect(decodeText(new TextEncoder().encode(SAMPLE))).toBe(SAMPLE);
  });

  it('decodes UTF-8 with BOM, stripping the BOM', () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(SAMPLE)]);
    expect(decodeText(bytes)).toBe(SAMPLE);
  });

  it('decodes UTF-16LE with BOM', () => {
    expect(decodeText(utf16le(SAMPLE, true))).toBe(SAMPLE);
  });

  it('decodes BOM-less UTF-16LE via the NUL heuristic', () => {
    expect(decodeText(utf16le(SAMPLE, false))).toBe(SAMPLE);
  });

  it('decodes UTF-16BE with BOM', () => {
    const le = utf16le(SAMPLE, false);
    const be = new Uint8Array(le.length + 2);
    be[0] = 0xfe;
    be[1] = 0xff;
    for (let i = 0; i < le.length; i += 2) {
      be[2 + i] = le[i + 1];
      be[3 + i] = le[i];
    }
    expect(decodeText(be)).toBe(SAMPLE);
  });
});
