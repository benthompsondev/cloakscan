import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { privacyCases, benignCases } from '../src/test-fixtures/privacyAssurance';

// Each fixture goes through the production UI independently. Unit tests also
// prove complete span coverage, including tails, in both output modes.
for (let batch = 0; batch < 4; batch += 1) {
  test(`synthetic adversarial UI batch ${batch + 1}`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto('/');
    await page.getByLabel('Detection profile').selectOption('maximum');
    for (const fixture of privacyCases.filter((_, index) => index % 4 === batch)) {
      await test.step(fixture.name, async () => {
        await page.getByLabel('Source text input').fill(fixture.source);
        await page.getByRole('button', { name: 'Scan locally' }).click();
        const output = page.getByLabel('Sanitized output with placeholders');
        for (const value of fixture.hidden) await expect(output).not.toContainText(value);
        for (const value of fixture.kept ?? []) await expect(output).toContainText(value);
        await page.getByRole('button', { name: 'Portfolio-code', exact: true }).click();
        for (const value of fixture.hidden) await expect(output).not.toContainText(value);
        await page.getByRole('button', { name: 'Safe-share', exact: true }).click();
        await page.getByRole('button', { name: 'New Scan' }).click();
      });
    }
  });
}

test('technical prose remains usable and clinical review limits are visible', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Detection profile').selectOption('maximum');
  await page.getByLabel('Source text input').fill(benignCases.join('\n'));
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const output = page.getByLabel('Sanitized output with placeholders');
  for (const source of benignCases) {
    for (const line of source.split('\n')) await expect(output).toContainText(line);
  }
  await expect(page.getByText(/Clinical narratives, unlabeled patient data/)).toBeVisible();
});

test('adversarial preview, clipboard and download preserve the same cleaned text', async ({ page, context }, testInfo) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByLabel('Detection profile').selectOption('maximum');
  const cases = privacyCases.filter((fixture) => [
    'YAML block comment', 'JSON Basic header', 'health identifier tail',
    'JSON DOB', 'internal URL containing credential',
  ].includes(fixture.name));
  await page.getByLabel('Source text input').fill(cases.map((fixture) => fixture.source).join('\n'));
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const output = page.getByLabel('Sanitized output with placeholders');
  for (const fixture of cases) {
    for (const value of fixture.hidden) await expect(output).not.toContainText(value);
  }
  await page.getByRole('button', { name: 'Copy clean text' }).click();
  await expect(page.getByText('Cleaned text copied to clipboard.')).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .txt' }).click();
  const download = await pending;
  // Windows converts clipboard newlines to CRLF. Downloaded text retains LF.
  const downloaded = await readFile((await download.path())!, 'utf8');
  expect(downloaded).toBe(copied.replace(/\r\n/g, '\n'));
  const previewLines = await output.locator('.code-text').allTextContents();
  expect(previewLines.join('\n')).toBe(downloaded);
  for (const fixture of cases) {
    for (const value of fixture.hidden) expect(copied).not.toContain(value);
  }
  await page.screenshot({ path: testInfo.outputPath('privacy-assurance.png'), fullPage: true });
});
