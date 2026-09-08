// Minimized from seeds 1 and 7 before changing normalization.
export const privacyFuzzRegressions = [
  { name: 'invisible label and value separators', source: 'pa\u200bssword="Falcon!47-Se\ufeffcretTail"', secret: 'Falcon!47-Se\ufeffcretTail' },
  { name: 'BOM around JSON field delimiter', source: '{"pass\\u0077ord"\ufeff:\ufeff"Falcon!47-SecretTail"}', secret: 'Falcon!47-SecretTail' },
  { name: 'fullwidth quotes around escaped health ID', source: '｛＂MRN＂:＂ZX-12\\u003345678-99887766＂｝', secret: 'ZX-12\\u003345678-99887766' },
  { name: 'invisible phone digits', source: 'Phone: "416-555\u200b-0\u200b123"', secret: '416-555\u200b-0\u200b123' },
  { name: 'invisible internal hostname and URL tail', source: 'https://vault.int\u200bernal/private/(patient)/AB123456\u200b', secret: 'https://vault.int\u200bernal/private/(patient)/AB123456\u200b' },
];

export const privacyFuzzBenignRegressions = [
  // Seed 49418/case 15: BOM split the raw URL before its public domain suffix.
  "documentation='https://ex\ufeffample.com/oauth'",
];
