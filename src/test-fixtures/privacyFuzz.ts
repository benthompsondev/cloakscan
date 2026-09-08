/** Seeded, bounded grammar fuzzing. Values are invented, never read from a corpus. */
export function privacyFuzz(seed: number, count = 120, benign = false) {
  let state = seed >>> 0;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x100000000;
  };
  const pick = <T,>(values: readonly T[]) => values[Math.floor(random() * values.length)];
  const fields = benign ? [
    ['password_length', '24'], ['documentation', 'https://example.com/oauth'],
    ['MRN', 'pending'], ['Phone', 'unavailable'], ['status', 'ready'],
  ] : [
    ['password', 'Falcon!47-SecretTail'], ['api_key', 'DemoKey!47-PrivateTail'],
    ['MRN', 'ZX-12345678-99887766'], ['Patient_ID', 'AB12345678'],
    ['DOB', '1988-03-19'], ['Phone', '416-555-0123'],
    ['email', 'mira.synthetic@example.net'],
    ['url', 'https://vault.internal/private/(patient)/AB123456'],
    ['token', `ghp_${'Q7'.repeat(18)}`],
  ];
  return Array.from({ length: count }, (_, index) => {
    const [label, value] = pick(fields);
    const json = random() < 0.6;
    const fullwidth = random() < 0.4;
    const invisible = pick(['', '\u200b', '\ufeff']);
    const mutate = (text: string) => [...text].map((char) => {
      let out = char;
      if (/[a-z]/i.test(char) && random() < 0.2) out = char.toUpperCase();
      if (json && /[a-z0-9]/i.test(out) && random() < 0.2)
        out = `\\u${out.charCodeAt(0).toString(16).padStart(4, '0')}`;
      else if (fullwidth && /[A-Za-z0-9]/.test(out) && random() < 0.2)
        out = String.fromCharCode(out.charCodeAt(0) + 0xfee0);
      return out + (random() < 0.12 ? invisible : '');
    }).join('');
    const key = mutate(label);
    const secret = mutate(value);
    const ws = pick([' ', '\t', '\u00a0', '\u2009', '\u200b', '\ufeff']);
    const nl = pick(['\n', '\r\n']);
    const quote = json ? pick(['"', '＂']) : pick(["'", '"']);
    const inner = json
      ? `${quote}${key}${quote}${ws}:${ws}${quote}${secret}${quote}`
      : `${key}${ws}=${ws}${quote}${secret}${quote}`;
    const source = json ? `🔒${nl}{"outer":{${nl}  ${inner}${nl}},"status":"ok"}` : `🔒${nl}${inner}${nl}status: ok`;
    return { name: `seed=${seed}/case=${index}/${label}`, source, secret };
  });
}

export const FUZZ_SEEDS = [1, 7, 47, 12345, 0xdecafbad, 0xc10a, 20260907, 913, 4096, 65537, 8675309, 0xffffffff];

/** Mix literal multiline and shell quote forms with independently seeded spacing. */
export function privacySyntaxFuzz(seed: number) {
  let state = seed >>> 0;
  const next = () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return state >>> 0; };
  return Array.from({ length: 12 }, (_, index) => {
    const nl = next() % 2 ? '\n' : '\r\n';
    const ws = [' ', '\t', '\u200b', '\ufeff'][next() % 4];
    const key = next() % 2 ? 'pa\u200bssword' : 'ＰＡＳＳＷＯＲＤ';
    const head = `Falcon!${next()}-Private`;
    const tail = `Tail-${next()}`;
    const variants = [
      { source: `${key}${ws}=${ws}"${head}${nl}${tail}"`, secret: `${head}${nl}${tail}` },
      { source: `$${key}${ws}=${ws}@'${nl}${head}${nl}${tail}${nl}'@`, secret: `${head}${nl}${tail}` },
      { source: `${key}: |- # literal${nl}  ${head}${nl}  ${tail}${nl}status: ok`, secret: `${head}${nl}  ${tail}` },
      { source: `${key}='${head}'\\''${tail}'`, secret: `${head}'\\''${tail}` },
      { source: `{"${key}":"${head}\\n${tail}"}`, secret: `${head}\\n${tail}` },
      { source: `postgresql://demo:${head}%2F${tail}@db.internal/demo`, secret: `postgresql://demo:${head}%2F${tail}@db.internal/demo` },
    ];
    return { name: `syntax/seed=${seed}/case=${index}`, ...variants[next() % variants.length] };
  });
}
