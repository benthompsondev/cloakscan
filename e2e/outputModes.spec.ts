import { test, expect } from '@playwright/test';

// v1.3: output modes, Cloak List mappings, review leads, invalid-code hints.
// All data below is synthetic.

test('a Cloak List mapping rewrites identifiers in Portfolio-code mode', async ({ page }) => {
  // Create a Cloak List that maps Nirv -> SourceSystem.
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Org mappings');
  await page.getByRole('button', { name: 'Add mapping' }).click();
  await page.getByLabel('Mapping term').fill('Nirv');
  await page.getByLabel('Mapping replacement identifier').fill('SourceSystem');
  await page.getByRole('button', { name: 'Save Cloak List' }).click();
  await page
    .getByRole('switch', { name: 'Enable Cloak List Org mappings in the active profile' })
    .check();

  // Scan PowerShell that uses the term inside identifiers.
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await page
    .getByLabel('Source text input')
    .fill('$NirvSystemID = 4\nfunction Enable-NirvAccount { param([string]$NirvId) }');
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const preview = page.getByRole('region', { name: /Redacted preview/i });
  // Safe-share: bracket placeholders, plus honest warnings that the result
  // is no longer valid PowerShell.
  await expect(preview).toContainText('$[CUSTOM_TERM_1]SystemID = 4');
  await expect(page.getByRole('note', { name: 'Possible invalid code' })).toBeVisible();

  // Portfolio-code: valid generic identifiers, instantly, no rescan.
  await page.getByRole('button', { name: 'Portfolio-code' }).click();
  await expect(preview).toContainText('$SourceSystemSystemID = 4');
  await expect(preview).toContainText('function Enable-SourceSystemAccount');
  await expect(preview).toContainText('param([string]$SourceSystemId)');
  await expect(page.getByRole('note', { name: 'Possible invalid code' })).toBeHidden();

  // And straight back.
  await page.getByRole('button', { name: 'Safe-share' }).click();
  await expect(preview).toContainText('$[CUSTOM_TERM_1]SystemID = 4');
});

test('review leads are visible, filterable, and never rewrite output', async ({ page }) => {
  await page.goto('/#/');
  const source = 'Get-ADUser $u -Properties SamAccountName\n$cred = Import-Clixml -Path $p';
  await page.getByLabel('Source text input').fill(source);
  await page.getByRole('button', { name: 'Scan locally' }).click();

  // Leads listed with their chip, output untouched.
  const findings = page.getByRole('region', { name: 'Findings' });
  const leadChips = findings.locator('.chip-lead');
  await expect(leadChips.first()).toBeVisible();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('Get-ADUser $u -Properties SamAccountName');

  // The filter hides them.
  const leadsToggle = page.getByRole('checkbox', { name: /review lead/ });
  await leadsToggle.uncheck();
  await expect(leadChips).toHaveCount(0);
});
