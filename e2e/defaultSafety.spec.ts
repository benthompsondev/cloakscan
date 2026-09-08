import { test, expect } from '@playwright/test';

test('default profile makes omitted sensitive-data coverage explicit before copying', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Detection profile')).toHaveValue('balanced');
  await page.getByLabel('Source text input').fill('DOB: 1988-03-19\nMRN: AB12345678\npassword=Falcon!47');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const output = page.getByLabel('Sanitized output with placeholders');
  await expect(output).not.toContainText('Falcon!47');
  await expect(output).toContainText('1988-03-19');
  await expect(page.getByRole('alert', { name: 'Disabled sensitive-data rules' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sanitization readiness' })).not.toContainText('No flagged items');
  await page.getByRole('button', { name: 'Enable all built-in rules' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(output).not.toContainText('1988-03-19');
  await expect(output).not.toContainText('AB12345678');
  await expect(page.getByRole('alert', { name: 'Disabled sensitive-data rules' })).toBeHidden();
});
