import { test, expect } from '@playwright/test';
import { privacyFuzzRegressions, privacyFuzzBenignRegressions } from '../src/test-fixtures/privacyFuzzRegressions';

test('minimized fuzz regressions survive the production UI in both modes', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Detection profile').selectOption('maximum');
  for (const { source, secret } of privacyFuzzRegressions) {
    await page.getByRole('button', { name: 'Safe-share', exact: true }).click();
    await page.getByLabel('Source text input').fill(source);
    await page.getByRole('button', { name: 'Scan locally' }).click();
    const output = page.getByLabel('Sanitized output with placeholders');
    await expect(output).not.toContainText(secret);
    await page.getByRole('button', { name: 'Portfolio-code', exact: true }).click();
    await expect(output).not.toContainText(secret);
    await page.getByRole('button', { name: 'New Scan' }).click();
  }
  for (const source of privacyFuzzBenignRegressions) {
    await page.getByLabel('Source text input').fill(source);
    await page.getByRole('button', { name: 'Scan locally' }).click();
    await expect(page.getByLabel('Sanitized output with placeholders').locator('.code-text')).toHaveText(source);
    await page.getByRole('button', { name: 'New Scan' }).click();
  }
});
