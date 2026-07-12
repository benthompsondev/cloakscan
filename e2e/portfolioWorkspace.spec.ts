import { test, expect } from '@playwright/test';

// v1.4: Portfolio Review Workspace — output mode in Settings, readiness
// summary, candidate bulk actions, Build Portfolio Cloak List, strategies.
// All data below is synthetic.

test('output mode is first-class in Settings → General and profile-independent', async ({
  page,
}) => {
  await page.goto('/#/settings/general');

  const modeGroup = page.getByRole('radiogroup', { name: 'Output mode' });
  await expect(modeGroup).toBeVisible();
  await expect(page.getByText('independent of the detection profile')).toBeVisible();

  // Switch to Portfolio-code from Settings…
  await modeGroup.getByRole('radio', { name: /Portfolio-code/ }).check();

  // …and the Scan screen toolbar reflects it.
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(
    page.getByRole('group', { name: 'Output mode' }).getByRole('button', { name: 'Portfolio-code' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

test('readiness summary reports open items and settles when handled', async ({ page }) => {
  await page.goto('/#/');
  // Repeated org name -> a candidate suggestion -> an open readiness item.
  await page
    .getByLabel('Source text input')
    .fill('Contoso Health opened the case.\nContoso Health closed the case.');
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const readiness = page.getByRole('region', { name: 'Sanitization readiness' });
  await expect(readiness).toBeVisible();
  await expect(readiness).toContainText('to review');
  await expect(readiness).toContainText('suggested term');

  // Dismissing the suggestion clears the item.
  await page.getByRole('button', { name: 'Dismiss Contoso Health' }).click();
  await expect(readiness).toContainText('No open items');
});

test('keeping a medium-severity finding as-is keeps readiness open', async ({ page }) => {
  await page.goto('/#/');
  // A lone IPv4 address: one medium-severity finding, nothing else.
  await page.getByLabel('Source text input').fill('Server responds at 203.0.113.42 today.');
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const readiness = page.getByRole('region', { name: 'Sanitization readiness' });
  await expect(readiness).toContainText('No open items');

  // Keep the finding as-is — the original value ships, so readiness must reopen.
  await page.getByLabel(/Redact IPv4 address/).uncheck();
  await expect(readiness).toContainText('to review');
  await expect(readiness).toContainText('1 medium');
  await expect(readiness).not.toContainText('No open items');

  // Redacting it again settles the summary.
  await page.getByLabel(/Redact IPv4 address/).check();
  await expect(readiness).toContainText('No open items');
});

test('bulk candidate selection builds a pre-filled Portfolio Cloak List', async ({ page }) => {
  await page.goto('/#/');
  await page
    .getByLabel('Source text input')
    .fill(
      [
        '$NirvSystemID = Get-Item',
        'Contoso Health approved the export. Contoso Health signed off.',
        'NWRH replied. NWRH agreed.',
      ].join('\n'),
    );
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const panel = page.getByRole('region', { name: 'Possible names and terms to review' });
  await expect(panel).toBeVisible();

  // Suggested replacements are shown next to likely terms.
  await expect(panel).toContainText('SourceOrg');

  await panel.getByRole('button', { name: /Select likely terms/ }).click();
  await panel.getByRole('button', { name: /Build Portfolio Cloak List/ }).click();

  // The Cloak List editor opens pre-filled with suggested mappings,
  // addressed by named rows rather than positional .first() lookups.
  await expect(page.getByRole('region', { name: 'Cloak List editor' })).toBeVisible();
  await expect(page.getByLabel('Cloak List name')).toHaveValue('Portfolio Cloak List');
  const contosoRow = page.getByRole('listitem', { name: 'Mapping for Contoso Health' });
  await expect(contosoRow.getByLabel('Mapping term')).toHaveValue('Contoso Health');
  await expect(contosoRow.getByLabel('Mapping replacement identifier')).toHaveValue('SourceOrg');
  const nwrhRow = page.getByRole('listitem', { name: 'Mapping for NWRH' });
  await expect(nwrhRow.getByLabel('Mapping replacement identifier')).toHaveValue('SourceSystem');

  // Every seeded row uses the code-only strategy and can be saved as-is.
  await expect(contosoRow.getByLabel('Mapping replacement strategy')).toHaveValue('code-only');
  await expect(nwrhRow.getByLabel('Mapping replacement strategy')).toHaveValue('code-only');
  // The seeded editor offers save-and-rescan as primary; plain save remains.
  await expect(page.getByRole('button', { name: 'Save, use this list & rescan' })).toBeVisible();
  await page.getByRole('button', { name: 'Save list only' }).click();
  await expect(
    page.getByRole('region', { name: 'Profiles and packs' }).getByText('Portfolio Cloak List'),
  ).toBeVisible();
});

test('mapping rows offer all four replacement strategies', async ({ page }) => {
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByRole('button', { name: 'Add mapping' }).click();

  const strategy = page.getByLabel('Mapping replacement strategy');
  await expect(strategy.locator('option')).toHaveText([
    'Code identifiers only',
    'Genericize everywhere',
    'Placeholder',
    'Review lead only',
  ]);

  // Review-lead strategy accepts an empty replacement; code-only demands one.
  await page.getByLabel('Mapping term').fill('Nirv');
  await expect(page.getByText('needs a replacement identifier')).toBeVisible();
  await strategy.selectOption('review-lead');
  await expect(page.getByText('needs a replacement identifier')).toBeHidden();
});

test('detection rules can be filtered to review leads and new categories', async ({ page }) => {
  await page.goto('/#/settings/rules');

  await page.getByRole('button', { name: 'Review leads' }).click();
  const rows = page.getByRole('list', { name: 'Rules' }).locator('.rule-row');
  await expect(rows.first()).toBeVisible();
  const leadCount = await rows.count();
  expect(leadCount).toBeGreaterThanOrEqual(6);

  await page.getByRole('button', { name: 'Review leads' }).click();
  await page.getByRole('button', { name: /Directory \/ AD/ }).click();
  await expect(rows.first()).toContainText(/AD|Directory|distinguished/i);
});
