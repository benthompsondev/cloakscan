/**
 * Mask a detected value for on-screen preview so the UI never shows (and the
 * app never logs) the full sensitive string.
 */
export function maskValue(value: string): string {
  if (value.length <= 6) return value.slice(0, 1) + '••••';
  const tail = value.length > 14 ? value.slice(-2) : '';
  return value.slice(0, 4) + '••••••••' + tail;
}
