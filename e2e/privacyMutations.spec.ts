import { test, expect } from '@playwright/test';
import { boundaryMutations, fieldMutations } from '../src/test-fixtures/privacyMutations';

const mutations = [...boundaryMutations, ...fieldMutations.filter((_, index) => index % 17 === 0)];
for (let batch = 0; batch < 3; batch += 1) {
  test(`mutation UI batch ${batch + 1}`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await page.getByLabel('Detection profile').selectOption('maximum');
    for (const fixture of mutations.filter((_, index) => index % 3 === batch)) {
      await test.step(fixture.name, async () => {
        await page.getByRole('button', { name: 'Safe-share', exact: true }).click();
        await page.getByLabel('Source text input').fill(fixture.source);
        await page.getByRole('button', { name: 'Scan locally' }).click();
        const output = page.getByLabel('Sanitized output with placeholders');
        await expect(output).not.toContainText(fixture.secret);
        await page.getByRole('button', { name: 'Portfolio-code', exact: true }).click();
        await expect(output).not.toContainText(fixture.secret);
        await page.getByRole('button', { name: 'New Scan' }).click();
      });
    }
  });
}
