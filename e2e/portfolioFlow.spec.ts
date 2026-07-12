import { test, expect, type Download, type Page } from '@playwright/test';

// v1.5: the complete portfolio workflow — scan, select suggested terms,
// build a Cloak List, save/use/rescan, compare modes, export the kit, and
// clear the session. All data below is synthetic.

// NIRV repeats in prose (a candidate suggestion) and sits inside an
// identifier so the code-only mapping produces a real replacement; the
// api_key line keeps a secret in play.
const SOURCE = [
  'NIRV processed the request. NIRV confirmed the export.',
  '$NirvExportID = 7',
  'api_key=sk_live_E2E00000000000000000000',
].join('\n');

async function scanSource(page: Page, source = SOURCE) {
  await page.goto('/#/');
  await page.getByLabel('Source text input').fill(source);
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();
}

async function buildAndUseList(page: Page) {
  const panel = page.getByRole('region', { name: 'Possible names and terms to review' });
  await panel.getByLabel('Select NIRV').check();
  await panel.getByRole('button', { name: /Build Portfolio Cloak List/ }).click();

  await expect(page.getByRole('region', { name: 'Cloak List editor' })).toBeVisible();
  await expect(page.getByLabel('Cloak List name')).toHaveValue('Portfolio Cloak List');
  const row = page.getByRole('listitem', { name: 'Mapping for NIRV' });
  await expect(row.getByLabel('Mapping replacement identifier')).toHaveValue('SourceSystem');

  await page.getByRole('button', { name: 'Save, use this list & rescan' }).click();
}

async function readDownload(download: Download): Promise<string> {
  const path = await download.path();
  const { readFileSync } = await import('node:fs');
  return readFileSync(path!, 'utf8');
}

test('complete flow: scan, build list, save/use/rescan, compare, export, clear', async ({
  page,
}) => {
  await scanSource(page);

  // Built-in profile is active before the flow.
  await expect(page.getByLabel('Detection profile')).toHaveValue('balanced');

  await buildAndUseList(page);

  // Back on Scan with an aggregate-count confirmation; the built-in forked
  // into the session-only Unsaved configuration.
  await expect(page.getByText(/Cloak List saved and applied — rescan found \d+ finding/)).toBeVisible();
  await expect(page.getByLabel('Detection profile')).toHaveValue('unsaved');
  await expect(
    page.getByRole('region', { name: 'Findings' }).getByText('Cloak mapping (Portfolio Cloak List)'),
  ).not.toHaveCount(0);

  // Comparison: both sanitized versions from the same findings.
  await page.getByRole('button', { name: /Compare output modes/ }).click();
  const safePane = page.getByRole('region', { name: 'Compare output modes' }).locator('.comparison-pane').first();
  const portfolioPane = page.getByRole('region', { name: 'Compare output modes' }).locator('.comparison-pane').nth(1);
  await expect(portfolioPane.locator('.comparison-text')).toContainText('$SourceSystemExportID');
  await expect(safePane.locator('.comparison-text')).not.toContainText('$SourceSystemExportID');
  await expect(page.getByText(/lines? differ between the modes/)).toBeVisible();
  // Neither pane shows the original term or the secret.
  for (const pane of [safePane, portfolioPane]) {
    await expect(pane.locator('.comparison-text')).not.toContainText('NIRV');
    await expect(pane.locator('.comparison-text')).not.toContainText('sk_live_E2E');
  }

  // Switch the main preview from the comparison.
  await portfolioPane.getByRole('button', { name: 'Use in main preview' }).click();
  await expect(
    page.getByRole('group', { name: 'Output mode' }).getByRole('button', { name: 'Portfolio-code' }),
  ).toHaveAttribute('aria-pressed', 'true');

  // Export the three kit files (readiness is clean in portfolio-code mode,
  // so no confirmation is needed here).
  const kit = page.getByRole('region', { name: 'Portfolio Export Kit' });
  const contents: Record<string, string> = {};
  for (const [index, filename] of [
    'cloakscan-portfolio.ps1',
    'cloakscan-findings-summary.txt',
    'cloakscan-review-checklist.md',
  ].entries()) {
    const downloadPromise = page.waitForEvent('download');
    await kit.getByRole('button', { name: 'Export', exact: true }).nth(index).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe(filename);
    contents[filename] = await readDownload(download);
  }

  // Portfolio file: portfolio-code output only — replacement in, term and
  // secret out.
  expect(contents['cloakscan-portfolio.ps1']).toContain('$SourceSystemExportID');
  expect(contents['cloakscan-portfolio.ps1']).not.toContain('NIRV');
  expect(contents['cloakscan-portfolio.ps1']).not.toContain('sk_live_E2E');

  // Clear session: every ephemeral piece goes; the saved list and forked
  // configuration stay (they are configuration, not scan content).
  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.getByLabel('Source text input')).toHaveValue('');
  await expect(page.getByRole('region', { name: 'Portfolio Export Kit' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Compare output modes' })).toBeHidden();
  await expect(page.getByRole('region', { name: 'Sanitization readiness' })).toBeHidden();
  await expect(page.getByLabel('Detection profile')).toHaveValue('unsaved');
});

test('exported summary and checklist stay aggregate-only', async ({ page }) => {
  await scanSource(page);
  await buildAndUseList(page);
  await expect(page.getByLabel('Detection profile')).toHaveValue('unsaved');

  // Keep readiness in its warning state (safe-share leaves an identifier
  // placeholder) to also exercise the honest Export-anyway gate.
  const kit = page.getByRole('region', { name: 'Portfolio Export Kit' });
  const summaryPromise = page.waitForEvent('download');
  await kit.getByRole('button', { name: 'Export', exact: true }).nth(1).click();
  await expect(kit.getByText('Exporting is not a sign-off')).toBeVisible();
  await kit.getByRole('button', { name: 'Export anyway' }).click();
  const summary = await readDownload(await summaryPromise);

  const checklistPromise = page.waitForEvent('download');
  await kit.getByRole('button', { name: 'Export', exact: true }).nth(2).click();
  await kit.getByRole('button', { name: 'Export anyway' }).click();
  const checklist = await readDownload(await checklistPromise);

  for (const [name, content] of Object.entries({ summary, checklist })) {
    for (const sentinel of [
      'NIRV', // mapped term
      'SourceSystem', // mapping replacement
      'Portfolio Cloak List', // list name
      'sk_live_E2E', // secret value
      'NirvExportID', // source excerpt
      'Balanced', // profile name
    ]) {
      expect(content, `${name} must not contain ${sentinel}`).not.toContain(sentinel);
    }
  }
  expect(summary).toContain('Findings:');
  expect(summary).toContain('review the sanitized file');
  expect(checklist).toContain('not a guarantee');
});

test('save, use & rescan updates only the active named profile', async ({ page }) => {
  await page.goto('/#/settings/profiles');
  await page.getByLabel('New profile name').fill('Sentinel Profile');
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();
  await expect(page.getByText('Profile "Sentinel Profile" created.')).toBeVisible();

  await scanSource(page);
  // Named profiles get generated profile-* ids; built-ins never do.
  await expect(page.getByLabel('Detection profile')).toHaveValue(/^profile-/);
  await buildAndUseList(page);

  // Still the named profile — no fork to Unsaved.
  await expect(page.getByText(/Cloak List saved and applied/)).toBeVisible();
  await expect(page.getByLabel('Detection profile')).toHaveValue(/^profile-/);
  await expect(
    page.getByRole('region', { name: 'Findings' }).getByText('Cloak mapping (Portfolio Cloak List)'),
  ).not.toHaveCount(0);

  // Built-ins are untouched: switching to Balanced drops the mapping.
  await page.getByLabel('Detection profile').selectOption('balanced');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Findings' }).getByText('Cloak mapping (Portfolio Cloak List)'),
  ).toHaveCount(0);
});

test('opening the comparison never triggers another scan', async ({ page }) => {
  await scanSource(page);
  const started = await page.getByText(/Started/).locator('..').innerText();

  await page.getByRole('button', { name: /Compare output modes/ }).click();
  await expect(
    page.getByRole('region', { name: 'Compare output modes' }).locator('.comparison-text').first(),
  ).toBeVisible();
  await page.getByRole('button', { name: /Compare output modes/ }).click();

  const startedAfter = await page.getByText(/Started/).locator('..').innerText();
  expect(startedAfter).toBe(started);
  // Items detected is unchanged too.
  await expect(page.getByText('Items detected').locator('..')).toContainText(/\d+/);
});

test('clear and reload leave no session state and no new storage surface', async ({ page }) => {
  await scanSource(page);
  await buildAndUseList(page);
  await expect(page.getByText(/Cloak List saved and applied/)).toBeVisible();

  // Remember preferences is off — nothing may be stored, list included.
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);

  await page.reload();
  await expect(page.getByLabel('Source text input')).toHaveValue('');
  await expect(page.getByLabel('Detection profile')).toHaveValue('balanced');
  expect(await page.evaluate(() => Object.keys(localStorage).length)).toBe(0);
});
