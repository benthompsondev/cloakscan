import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Smoke-check the scan workflow at the three target desktop sizes.
 * Set SCREENSHOTS=1 to also write reference screenshots to docs/screenshots.
 */
const SIZES = [
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

for (const size of SIZES) {
  test(`scan screen works at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/');

    await expect(page.getByText('Local-first', { exact: true })).toBeVisible();
    await expect(page.getByText('No cloud upload', { exact: true })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Sanitize sensitive text/i }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Load sample' }).click();
    await page.getByRole('button', { name: 'Scan locally' }).click();

    await expect(page.getByText('Local scan complete')).toBeVisible();
    await expect(page.getByRole('region', { name: /Redacted preview/i })).toContainText(
      '[EMAIL_1]',
    );
    await expect(
      page.getByText('Automated detection can miss sensitive information. Review before sharing.').first(),
    ).toBeVisible();

    if (process.env.SCREENSHOTS === '1') {
      mkdirSync('docs/screenshots', { recursive: true });
      await page.screenshot({
        path: `docs/screenshots/scan-desktop-${size.width}x${size.height}.png`,
        fullPage: true,
      });
    }
  });
}
