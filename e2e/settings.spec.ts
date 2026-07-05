import { test, expect, type Page } from '@playwright/test';

const PREFS_KEY = 'cloakguard.prefs.v2';

async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
    idbCount: (await indexedDB.databases()).length,
  }));
}

test('default load writes nothing to browser storage, even after a full scan', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('Contoso');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();

  const snapshot = await storageSnapshot(page);
  expect(snapshot.localKeys).toEqual([]);
  expect(snapshot.sessionKeys).toEqual([]);
  expect(snapshot.idbCount).toBe(0);
});

test('navigation is keyboard accessible', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Settings' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'General' })).toBeVisible();

  await page.getByRole('link', { name: 'Detection Rules' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Detection Rules' })).toBeVisible();

  await page.getByRole('link', { name: 'Privacy / About' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Privacy model' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Check for updates' })).toBeHidden();
});

test('detection rules view lists the real registry with a detail panel', async ({ page }) => {
  await page.goto('/#/settings/rules');
  // Real registry rows, not hardcoded: spot-check a few known rules.
  for (const rule of ['Bearer token', 'AD distinguished name', 'Person name (labeled field)']) {
    await expect(page.getByRole('button', { name: rule })).toBeVisible();
  }
  await page.getByRole('button', { name: /^Email address/ }).click();
  const detail = page.getByRole('complementary', { name: /Rule details/ });
  await expect(detail).toContainText('What it detects');
  await expect(detail).toContainText('False positives');
  await expect(detail).toContainText('[EMAIL_1]'); // synthetic replacement preview
});

test('name and organization rules show the coverage note with a Cloak List link', async ({
  page,
}) => {
  await page.goto('/#/settings/rules');
  await page.getByRole('button', { name: /^Person name/ }).click();
  const note = page.getByTestId('name-coverage-note');
  await expect(note).toContainText('may not find every name or organization');
  await expect(note).toContainText('Hide custom terms');

  await page.getByRole('button', { name: /^Organization name/ }).click();
  await expect(page.getByTestId('name-coverage-note')).toBeVisible();

  // The link inside the note lands on Profiles & Packs (Cloak Lists live there).
  await page.getByTestId('name-coverage-note').getByRole('link', { name: 'Cloak List' }).click();
  await expect(page.getByRole('heading', { name: 'Profiles & Packs' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cloak Lists' })).toBeVisible();
});

test('rule search and Strict/Enabled filters narrow the rules list', async ({ page }) => {
  await page.goto('/#/settings/rules');
  await page.getByLabel('Search rules').fill('private key');
  await expect(page.getByRole('button', { name: 'Private key block' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Email address/ })).toBeHidden();

  await page.getByLabel('Search rules').fill('');
  await page.getByRole('button', { name: 'Strict', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Canadian SIN' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Private key block' })).toBeHidden();
});

test('strict profile detects labeled person and org names; balanced does not', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('Reported by: Alex Demo'); // balanced keeps it
  await expect(preview).toContainText('Alex Demo,Contoso Health,[EMAIL_1]');

  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('radio', { name: /^Strict/ }).check();
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(preview).toContainText('Reported by: [NAME_1]');
  await expect(preview).toContainText('[NAME_1],[ORG_1],[EMAIL_1]');
});

test('toggling an individual rule switches the profile to Custom', async ({ page }) => {
  await page.goto('/#/settings/rules');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).click();
  await page.getByRole('link', { name: /^General/ }).click();
  await expect(page.getByText('Created automatically when you enable or disable')).toBeVisible();
  await expect(page.getByRole('radio', { name: /^Balanced/ })).not.toBeChecked();

  // And the disabled rule stops producing findings: no [EMAIL_n] anywhere.
  // (The internal-hostname rule still redacts the domain part — lower-priority
  // rules take over once the email rule is out of the way.)
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('alex.demo@');
  await expect(preview).not.toContainText('[EMAIL_1]');
});

test('redaction format changes apply to the scan output', async ({ page }) => {
  await page.goto('/#/settings/formats');
  await page.getByRole('radio', { name: /Uniform replacement/ }).check();
  await expect(page.locator('.format-preview')).toContainText('[REDACTED]');

  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[REDACTED]');
  await expect(preview).not.toContainText('[EMAIL_1]');
});

test('custom templates are validated', async ({ page }) => {
  await page.goto('/#/settings/formats');
  await page.getByRole('radio', { name: /Custom template/ }).check();
  const input = page.locator('#custom-template');
  await input.fill('{VALUE}');
  await expect(page.getByRole('alert')).toContainText('Unknown token');
  await input.fill('<{TYPE}-{INDEX}>');
  await expect(page.getByRole('alert')).toBeHidden();
});

test('preference opt-in stores only the allowlisted object; opt-out deletes it', async ({
  page,
}) => {
  await page.goto('/');
  // Put content and terms into the session first, so we can prove they are not persisted.
  await page.getByLabel('Source text input').fill('secret-source-content ping 10.9.8.7');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('very-private-term');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/#/settings/general');
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).click();

  const stored = await page.evaluate(
    ([key]) => ({ keys: Object.keys(localStorage), raw: localStorage.getItem(key) }),
    [PREFS_KEY],
  );
  expect(stored.keys).toEqual([PREFS_KEY]);
  const parsed = JSON.parse(stored.raw!);
  expect(Object.keys(parsed).sort()).toEqual(['activeProfileId', 'customPacks', 'profiles', 'version']);
  expect(parsed.version).toBe(2);
  expect(stored.raw).not.toContain('secret-source-content');
  expect(stored.raw).not.toContain('very-private-term');

  // Turning it off deletes the key.
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});

test('remembered preferences survive reload; content never does', async ({ page }) => {
  await page.goto('/#/settings/general');
  await page.getByRole('radio', { name: /^Strict/ }).check();
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).click();

  await page.goto('/');
  await page.getByLabel('Source text input').fill('refresh should clear this 10.9.8.7');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('ephemeral-term');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();

  await page.reload();
  // Content and terms are gone...
  await expect(page.getByLabel('Source text input')).toHaveValue('');
  await expect(page.getByText('Local scan complete')).toBeHidden();
  await page.getByRole('button', { name: 'Hide custom terms' }).click();
  await expect(page.getByRole('textbox', { name: 'Custom terms to hide' })).toHaveValue('');
  await page.getByRole('button', { name: 'Done' }).click();
  // ...but the remembered profile is still Strict.
  await expect(page.getByLabel('Detection profile')).toHaveValue('strict');

  // Clean up so later tests start fresh.
  await page.evaluate(() => localStorage.clear());
});

test('privacy page shows storage state and clears preferences', async ({ page }) => {
  await page.goto('/#/settings/privacy');
  await expect(page.getByText('Preference storage is OFF.')).toBeVisible();

  await page.getByRole('switch', { name: /Remember preferences on this device/ }).click();
  await expect(page.getByText('Preference storage is ON.')).toBeVisible();

  await page.getByRole('button', { name: 'Clear preferences' }).click();
  await expect(page.getByText('Preference storage is OFF.')).toBeVisible();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
});
