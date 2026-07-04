import { describe, expect, it } from 'vitest';
import { buildCleanText } from './sanitize';
import { scanText } from './scan';
import {
  POWERSHELL_STRESS_EXPECTED,
  POWERSHELL_STRESS_INPUT,
} from '../test-fixtures/powershellStress';

describe('synthetic PowerShell stress fixture', () => {
  it('redacts sensitive literals without corrupting executable syntax', () => {
    expect(buildCleanText(POWERSHELL_STRESS_INPUT, scanText(POWERSHELL_STRESS_INPUT))).toBe(
      POWERSHELL_STRESS_EXPECTED,
    );
  });

  it('never returns findings inside known PowerShell regex pattern strings', () => {
    const text = String.raw`$a = $a -replace '[^a-zA-Z0-9]', ''
if ($value -match '^INC104892$') { "matched" }
if ($value -notmatch '[A-Z]{2,5}[0-9]{3,8}') { "not matched" }
Select-String -InputObject $value -Pattern 'CHG543210'
[regex]::Match($value, 'REQ123456')
switch -Regex ($value) {
  'PRB123456' { "matched" }
}`;

    expect(buildCleanText(text, scanText(text))).toBe(text);
  });
});
