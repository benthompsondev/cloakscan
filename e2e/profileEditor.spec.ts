import { test, expect, type Page } from '@playwright/test';

const PREFS_V2 = 'cloakguard.prefs.v2';

/** Create a named profile from the current configuration and return to Profiles. */
async function createProfile(page: Page, name: string) {
  await page.goto('/#/settings/profiles');
  await page.getByLabel('New profile name').fill(name);
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();
}

async function openEditor(page: Page, name: string) {
  await page.getByRole('button', { name: `Edit profile ${name}` }).click();
  await expect(page.getByRole('heading', { name: `Edit profile: ${name}` })).toBeVisible();
}

test('built-in profiles are read-only: no Edit profile action exists for them', async ({
  page,
}) => {
  await createProfile(page, 'Support profile');
  await expect(page.getByRole('button', { name: 'Edit profile Support profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit profile Balanced' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit profile Strict' })).toHaveCount(0);
});

test('opening the editor focuses its heading and never activates the edited profile', async ({
  page,
}) => {
  await createProfile(page, 'Support profile');
  // Make Balanced active again so the editor provably targets an INACTIVE profile.
  await page.getByRole('button', { name: /^Balanced/ }).click();

  await openEditor(page, 'Support profile');
  await expect(page.getByRole('heading', { name: 'Edit profile: Support profile' })).toBeFocused();

  // Draft edits: disable a rule and switch the base mode.
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('radio', { name: /^Strict/ }).check();
  await expect(page.getByTestId('profile-editor-rule-counts')).toContainText('1 explicit override');

  // Cancel discards every draft change and Balanced is still the active profile.
  await page.getByRole('button', { name: 'Cancel' }).click();
  const balancedRow = page.getByRole('button', { name: /^Balanced/ });
  await expect(balancedRow).toContainText('Active');

  await openEditor(page, 'Support profile');
  await expect(page.getByRole('switch', { name: 'Enable rule Email address' })).toBeChecked();
  await expect(page.getByRole('radio', { name: /^Balanced/ })).toBeChecked();
  await expect(page.getByTestId('profile-editor-rule-counts')).toContainText('0 explicit overrides');
});

test('Save updates only the intended profile; the other profile is untouched', async ({
  page,
}) => {
  await createProfile(page, 'Sharing profile');
  await createProfile(page, 'Support profile');

  await openEditor(page, 'Sharing profile');
  await page.getByLabel('Profile description').fill('Synthetic demo: sharing logs externally');
  await page.getByRole('radio', { name: /^Strict/ }).check();
  await page.getByRole('checkbox', { name: 'Include pack Canada Pack in this profile' }).check();
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('radio', { name: /Uniform replacement/ }).check();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await expect(page.getByText('Profile "Sharing profile" updated.')).toBeVisible();

  // The sibling profile keeps its defaults.
  await openEditor(page, 'Support profile');
  await expect(page.getByLabel('Profile description')).toHaveValue('');
  await expect(page.getByRole('radio', { name: /^Balanced/ })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Include pack Canada Pack in this profile' }),
  ).not.toBeChecked();
  await expect(page.getByTestId('profile-editor-rule-counts')).toContainText('0 explicit overrides');
  await expect(page.getByRole('radio', { name: /Indexed labels/ })).toBeChecked();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // The edited profile kept every change.
  await openEditor(page, 'Sharing profile');
  await expect(page.getByLabel('Profile description')).toHaveValue(
    'Synthetic demo: sharing logs externally',
  );
  await expect(page.getByRole('radio', { name: /^Strict/ })).toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Include pack Canada Pack in this profile' }),
  ).toBeChecked();
  await expect(page.getByRole('switch', { name: 'Enable rule Email address' })).not.toBeChecked();
  await expect(page.getByTestId('profile-editor-rule-counts')).toContainText('1 explicit override');
  await expect(page.getByRole('radio', { name: /Uniform replacement/ })).toBeChecked();
});

test('saved base mode, Cloak List, and format changes drive real scan output', async ({
  page,
}) => {
  // A Cloak List the profile will include.
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Org names');
  await page.getByLabel('Cloak List terms').fill('Contoso General');
  await page.getByRole('button', { name: 'Save Cloak List' }).click();

  await createProfile(page, 'Sharing profile');
  await openEditor(page, 'Sharing profile');
  await page.getByRole('checkbox', { name: 'Include Cloak List Org names in this profile' }).check();
  await page.getByRole('radio', { name: /Uniform replacement/ }).check();
  await page.getByRole('button', { name: 'Save profile' }).click();

  // Activate it and scan synthetic text.
  await page.getByRole('button', { name: /^Sharing profile/ }).click();
  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByLabel('Active packs')).toContainText('Org names · Cloak List');
  await page
    .getByLabel('Source text input')
    .fill('ticket from Contoso General reception, contact alex.demo@example.internal');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[REDACTED]');
  await expect(preview).not.toContainText('Contoso General');
  await expect(preview).not.toContainText('[EMAIL_1]'); // uniform format everywhere
});

test('saving an ACTIVE profile invalidates results only when scanning behavior changed', async ({
  page,
}) => {
  await createProfile(page, 'Support profile'); // created active
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();

  // Description-only save: existing results stay.
  await page.goto('/#/settings/profiles');
  await openEditor(page, 'Support profile');
  await page.getByLabel('Profile description').fill('Only words changed');
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByText('Local scan complete')).toBeVisible();

  // Rule-change save: stale results are cleared.
  await page.goto('/#/settings/profiles');
  await openEditor(page, 'Support profile');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('button', { name: 'Save profile' }).click();
  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByText('Local scan complete')).toBeHidden();
});

test('remember ON: edited profile survives reload; content still never persists', async ({
  page,
}) => {
  await page.goto('/#/settings/general');
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).check();

  await createProfile(page, 'Sharing profile');
  await openEditor(page, 'Sharing profile');
  await page.getByLabel('Profile description').fill('Synthetic sharing profile');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('button', { name: 'Save profile' }).click();

  const raw = await page.evaluate(([k]) => localStorage.getItem(k), [PREFS_V2]);
  expect(raw).toContain('Sharing profile');
  expect(raw).toContain('Synthetic sharing profile');

  await page.reload();
  await openEditor(page, 'Sharing profile');
  await expect(page.getByLabel('Profile description')).toHaveValue('Synthetic sharing profile');
  await expect(page.getByRole('switch', { name: 'Enable rule Email address' })).not.toBeChecked();

  await page.evaluate(() => localStorage.clear());
});

test('remember OFF: saved editor changes stay session-only and write nothing', async ({
  page,
}) => {
  await createProfile(page, 'Support profile');
  await openEditor(page, 'Support profile');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('button', { name: 'Save profile' }).click();

  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  await expect(page.getByRole('button', { name: 'Edit profile Support profile' })).toHaveCount(0);
});

test('validation blocks Save: empty name and invalid custom template', async ({ page }) => {
  await createProfile(page, 'Support profile');
  await openEditor(page, 'Support profile');

  await page.getByLabel('Profile name').fill('');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  await page.getByLabel('Profile name').fill('Support profile');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();

  await page.getByRole('radio', { name: /Custom template/ }).check();
  await page.locator('#custom-template').fill('{VALUE}');
  await expect(page.getByRole('alert')).toContainText('Unknown token');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeDisabled();
  await page.locator('#custom-template').fill('<{TYPE}-{INDEX}>');
  await expect(page.getByRole('button', { name: 'Save profile' })).toBeEnabled();
});

test('the editor fits desktop viewports without horizontal overflow', async ({ page }) => {
  await createProfile(page, 'Sharing profile');
  for (const size of [
    { width: 1280, height: 720 },
    { width: 1440, height: 900 },
    { width: 1920, height: 1080 },
  ]) {
    // No goto here: reloading would discard the session-only profile.
    await page.setViewportSize(size);
    await openEditor(page, 'Sharing profile');
    await expect(page.getByRole('button', { name: 'Save profile' })).toBeInViewport();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${size.width}x${size.height}`).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Cancel' }).click();
  }
});
