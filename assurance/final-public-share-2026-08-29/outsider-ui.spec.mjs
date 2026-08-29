import { expect, test } from '@playwright/test';
import cases from './outsider-corpus.mjs';

test('executes the frozen outsider corpus through the production UI', async ({ page }) => {
  await page.goto('/');
  const results = [];

  for (const campaignCase of cases) {
    const edit = page.getByRole('button', { name: 'Edit text' });
    if (await edit.count()) await edit.click();

    await page
      .getByRole('combobox', { name: 'Detection profile' })
      .selectOption({ label: campaignCase.profile });
    await page
      .getByRole('button', { name: campaignCase.outputMode, exact: true })
      .click();
    await page.getByRole('textbox', { name: 'Source text' }).fill(campaignCase.input);

    const started = performance.now();
    await page.getByRole('button', { name: 'Scan locally' }).click();
    const wallMs = Math.round(performance.now() - started);

    const output = (
      await page
        .getByRole('region', { name: 'Redacted preview' })
        .locator('.code-text')
        .allTextContents()
    ).join('\n');
    const findingText = await page.getByRole('region', { name: 'Findings' }).innerText();
    const totalMatches = Number(findingText.match(/(\d+) total match/)?.[1] ?? 0);
    const forbiddenStillVisible = campaignCase.forbiddenOutput.filter((value) =>
      output.includes(value),
    );
    const requiredMissing = campaignCase.requiredOutput.filter(
      (value) => !output.includes(value),
    );
    const pass =
      campaignCase.expectation === 'redact'
        ? forbiddenStillVisible.length === 0 &&
          requiredMissing.length === 0 &&
          totalMatches >= campaignCase.minimumFindings
        : requiredMissing.length === 0 &&
          totalMatches <= (campaignCase.maximumFindings ?? 0);

    results.push({
      id: campaignCase.id,
      group: campaignCase.group,
      pass,
      totalMatches,
      wallMs,
      forbiddenStillVisible,
      requiredMissing,
      output: pass ? undefined : output,
    });
  }

  const failures = results.filter((result) => !result.pass);
  const summary = {
    target: process.env.CLOAKSCAN_TARGET_URL ?? 'http://127.0.0.1:5173',
    total: results.length,
    passes: results.length - failures.length,
    failures: failures.length,
    meanWallMs: Math.round(results.reduce((sum, result) => sum + result.wallMs, 0) / results.length),
    maxWallMs: Math.max(...results.map((result) => result.wallMs)),
    failureDetails: failures,
  };

  console.log(`FROZEN_CORPUS_RESULT=${JSON.stringify(summary)}`);
  expect(results).toHaveLength(148);
});
