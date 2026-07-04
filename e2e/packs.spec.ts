import { test, expect, type Page } from '@playwright/test';

const PREFS_V2 = 'cloakguard.prefs.v2';

async function enablePack(page: Page, packName: string) {
  await page.goto('/#/settings/profiles');
  await page.getByRole('switch', { name: `Enable pack ${packName} in the active profile` }).check();
}

test('enabling the Canada pack detects postal codes and shows a pack chip on Scan', async ({
  page,
}) => {
  await enablePack(page, 'Canada Pack');
  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByLabel('Active packs')).toContainText('Canada Pack');

  await page.getByLabel('Source text input').fill('PostalCode: K1A 0B1 and SIN: 123 456 782');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[POSTAL_CODE_1]');
  await expect(preview).toContainText('[SIN_1]');
});

test('enabling the US pack detects SSN and contextual ZIP', async ({ page }) => {
  await enablePack(page, 'United States Pack');
  await page.getByRole('link', { name: 'Scan' }).click();
  await page
    .getByLabel('Source text input')
    .fill('SSN: 123-45-6789\nAddress: 1 Demo St, Exampletown ZIP: 12345-6789\nport 54321 open');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[SSN_1]');
  await expect(preview).toContainText('[ZIP_1]');
  await expect(preview).toContainText('port 54321 open'); // no context, untouched
});

test('enabling the EU Common pack detects checksummed IBANs', async ({ page }) => {
  await enablePack(page, 'EU Common Pack');
  await page.getByRole('link', { name: 'Scan' }).click();
  await page
    .getByLabel('Source text input')
    .fill('refund DE89 3704 0044 0532 0130 00, bad DE89 3704 0044 0532 0130 01');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[IBAN_1]');
  await expect(preview).toContainText('DE89 3704 0044 0532 0130 01'); // checksum failure kept
});

test('detection rules show pack membership badges', async ({ page }) => {
  await page.goto('/#/settings/rules');
  const sinRow = page.getByRole('button', { name: /Canadian SIN/ });
  await expect(sinRow).toContainText('CA');
  const cardRow = page.getByRole('button', { name: /Payment card number/ });
  await expect(cardRow).toContainText('CA');
  await expect(cardRow).toContainText('US');
  await expect(cardRow).toContainText('EU');
});

test('the compliance disclaimer is visible on Profiles & Packs', async ({ page }) => {
  await page.goto('/#/settings/profiles');
  await expect(
    page.getByText(
      'Policy packs improve regional detection coverage. They do not guarantee legal or regulatory compliance.',
    ),
  ).toBeVisible();
});

test('creating and switching a named profile', async ({ page }) => {
  await enablePack(page, 'Canada Pack');
  await page.getByLabel('New profile name').fill('Ontario ops');
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();

  // The named profile is active and listed in the Scan toolbar selector.
  await page.getByRole('link', { name: 'Scan' }).click();
  const select = page.getByLabel('Detection profile');
  await expect(select.locator('option', { hasText: 'Ontario ops' })).toHaveCount(1);
  await expect(page.getByLabel('Active packs')).toContainText('Canada Pack');

  // Switching back to Balanced drops the pack; switching to the profile restores it.
  await select.selectOption('balanced');
  await expect(page.getByLabel('Active packs')).toBeHidden();
  await select.selectOption({ label: 'Ontario ops' });
  await expect(page.getByLabel('Active packs')).toContainText('Canada Pack');
});

test('custom pack with a labeled-field rule and pack terms', async ({ page }) => {
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await page.getByLabel('Pack name').fill('Helpdesk pack');
  await page.getByLabel('Pack cloak terms').fill('Contoso General');

  await page.getByRole('button', { name: 'Add labeled-field rule' }).click();
  await page.getByLabel('Custom rule name').fill('Badge number');
  await page.getByLabel('Field labels').fill('BadgeId');
  await page.getByLabel('Placeholder label').fill('BADGE_ID');
  // The synthetic preview proves the rule before saving.
  await expect(page.locator('.rule-preview-after')).toContainText('BadgeId: [BADGE_ID_1]');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await page.getByRole('button', { name: 'Save pack' }).click();

  await page
    .getByRole('switch', { name: 'Enable pack Helpdesk pack in the active profile' })
    .check();

  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByLabel('Active packs')).toContainText('Helpdesk pack');
  await page
    .getByLabel('Source text input')
    .fill('BadgeId: 998877 issued at Contoso General reception');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[BADGE_ID_1]');
  await expect(preview).toContainText('[CUSTOM_TERM_1]');
});

test('over-limit custom rule values are skipped whole, never partially redacted', async ({
  page,
}) => {
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await page.getByLabel('Pack name').fill('Limits pack');
  await page.getByRole('button', { name: 'Add labeled-field rule' }).click();
  await page.getByLabel('Custom rule name').fill('Department');
  await page.getByLabel('Field labels').fill('Department');
  await page.getByLabel('Placeholder label').fill('CUSTOM_ID');
  await page.getByLabel('Value type').selectOption('text');
  await page.getByLabel('Maximum captured length').fill('10');

  // Preview: an over-limit value is skipped whole and the editor explains why.
  await page
    .getByLabel('Synthetic preview text')
    .fill('Department: Operations And Facilities');
  await expect(page.locator('.rule-preview-after')).toHaveText(
    'Department: Operations And Facilities',
  );
  await expect(page.locator('.rule-preview-skip')).toContainText('left untouched');

  // Quoted preview within the limit redacts only the content inside the quotes.
  await page
    .getByLabel('Synthetic preview text')
    .fill('Department: "Operations" Status: Active');
  await expect(page.locator('.rule-preview-after')).toHaveText(
    'Department: "[CUSTOM_ID_1]" Status: Active',
  );
  await expect(page.locator('.rule-preview-skip')).toHaveCount(0);
  await page.getByRole('button', { name: 'Save rule' }).click();
  await page.getByRole('button', { name: 'Save pack' }).click();
  await page.getByRole('switch', { name: 'Enable pack Limits pack in the active profile' }).check();

  // Full engine: the over-limit line comes back byte-identical (no partial
  // placeholder, no truncated remainder); the quoted line keeps its quotes.
  await page.getByRole('link', { name: 'Scan' }).click();
  await page
    .getByLabel('Source text input')
    .fill('Department: "Operations" Status: Active\nDepartment: Operations And Facilities');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('Department: "[CUSTOM_ID_1]" Status: Active');
  await expect(preview).toContainText('Department: Operations And Facilities');
  await expect(preview).not.toContainText('[CUSTOM_ID_2]');
});

test('custom terms dialog: badge, feedback, toggles, example, clear', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await expect(page.getByRole('dialog', { name: 'Custom terms to hide' })).toBeVisible();
  await expect(page.getByText('Current session only · never saved')).toBeVisible();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('Contoso\ncontoso\nx\nsrv-app01');
  await expect(page.getByText('2 valid terms')).toBeVisible();
  await expect(page.getByText(/duplicates on line 2/)).toBeVisible();
  await expect(page.getByText(/too short .* on line 3/)).toBeVisible();

  // An over-length term is skipped WHOLE and reported, never truncated.
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill(`Contoso\n${'z'.repeat(121)}`);
  await expect(page.getByText('1 valid term', { exact: true })).toBeVisible();
  await expect(page.getByText(/too long .*skipped whole.* on line 2/)).toBeVisible();

  // Case-sensitive: the lowercase duplicate becomes a distinct valid term.
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('Contoso\ncontoso\nx\nsrv-app01');
  await page.getByRole('checkbox', { name: 'Case-sensitive matching' }).check();
  await expect(page.getByText('3 valid terms')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: 'Also match inside longer words (more aggressive)' }),
  ).not.toBeChecked();

  await expect(page.getByText('[CUSTOM_TERM_n]', { exact: false }).first()).toBeVisible();
  await expect(page.locator('.terms-example .rule-preview-after')).toContainText('[CUSTOM_TERM_1]');
  await expect(page.getByRole('link', { name: 'Manage reusable Cloak Lists' })).toBeVisible();

  await page.getByRole('button', { name: 'Clear terms' }).click();
  await expect(page.getByText('0 valid terms')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
});

test('remember off: profiles, packs, and terms vanish on reload', async ({ page }) => {
  await enablePack(page, 'Canada Pack');
  await page.getByLabel('New profile name').fill('Ephemeral');
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();
  await page.getByRole('link', { name: 'Scan' }).click();
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('vanishing-term');
  await page.getByRole('button', { name: 'Done' }).click();

  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await page.reload();
  const select = page.getByLabel('Detection profile');
  await expect(select).toHaveValue('balanced');
  await expect(select.locator('option', { hasText: 'Ephemeral' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Hide custom terms' }).click();
  await expect(page.getByRole('textbox', { name: 'Custom terms to hide' })).toHaveValue('');
});

test('Cloak List terms persist only behind BOTH opt-ins', async ({ page }) => {
  // Build a Cloak List with terms but WITHOUT the term-save opt-in.
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Persisted list');
  await page.getByLabel('Cloak List terms').fill('maybe-saved-term');
  await page.getByRole('button', { name: 'Save Cloak List' }).click();
  await page
    .getByRole('switch', { name: 'Enable Cloak List Persisted list in the active profile' })
    .check();
  await page.getByLabel('New profile name').fill('Keeper');
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();

  await page.goto('/#/settings/general');
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).click();
  const raw = await page.evaluate(([k]) => localStorage.getItem(k), [PREFS_V2]);
  expect(raw).toContain('Persisted list');
  expect(raw).toContain('Keeper');
  expect(raw).not.toContain('maybe-saved-term'); // no explicit term opt-in

  await page.reload();
  await page.goto('/#/scan');
  await expect(page.getByLabel('Detection profile')).toHaveValue(/profile-/);
  await expect(
    page.getByLabel('Detection profile').locator('option', { hasText: 'Keeper' }),
  ).toHaveCount(1);

  // Now opt terms in explicitly and confirm they survive a reload.
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await page.getByLabel('Cloak List terms').fill('maybe-saved-term');
  await page
    .getByRole('checkbox', {
      name: "Save this Cloak List's terms on this device.",
    })
    .check();
  await page.getByRole('button', { name: 'Save Cloak List' }).click();
  const raw2 = await page.evaluate(([k]) => localStorage.getItem(k), [PREFS_V2]);
  expect(raw2).toContain('maybe-saved-term');

  await page.reload();
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Edit', exact: true }).first().click();
  await expect(page.getByLabel('Cloak List terms')).toHaveValue('maybe-saved-term');

  await page.evaluate(() => localStorage.clear());
});

test('active Cloak Lists are visible on Scan and inside custom terms', async ({ page }) => {
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Org names');
  await page.getByLabel('Cloak List terms').fill('Contoso General');
  // The Cloak List editor shows the same synthetic before/after example.
  await expect(page.locator('.terms-example .rule-preview-after')).toContainText('[CUSTOM_TERM_1]');
  await page.getByRole('button', { name: 'Save Cloak List' }).click();
  await page
    .getByRole('switch', { name: 'Enable Cloak List Org names in the active profile' })
    .check();

  await page.getByRole('link', { name: 'Scan' }).click();
  await expect(page.getByLabel('Active packs')).toContainText('Org names · Cloak List');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await expect(page.getByTestId('active-cloak-lists')).toContainText('Org names');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByLabel('Source text input').fill('ticket from Contoso General reception');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByRole('region', { name: /Redacted preview/i })).toContainText(
    '[CUSTOM_TERM_1]',
  );
});

test('ambiguous empty creations are blocked with inline validation', async ({ page }) => {
  await page.goto('/#/settings/profiles');

  // A NEW Cloak List needs at least one valid term before Save is enabled.
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Empty list');
  await expect(page.getByRole('button', { name: 'Save Cloak List' })).toBeDisabled();
  await expect(page.getByText('an empty list has nothing to cloak')).toBeVisible();
  await page.getByLabel('Cloak List terms').fill('Contoso');
  await expect(page.getByText('an empty list has nothing to cloak')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save Cloak List' })).toBeEnabled();
  // The corrected local-save wording is what the user actually sees.
  await expect(
    page.getByRole('checkbox', { name: "Save this Cloak List's terms on this device." }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();

  // An advanced Custom Pack with only a name (and terms) cannot be saved:
  // a terms-only collection belongs in Cloak Lists.
  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await page.getByLabel('Pack name').fill('Name only');
  await page.getByLabel('Pack cloak terms').fill('Contoso');
  await expect(page.getByRole('button', { name: 'Save pack' })).toBeDisabled();
  await expect(page.getByText('create a Cloak List instead')).toBeVisible();
  await expect(
    page.getByRole('checkbox', { name: "Save this pack's Cloak terms on this device." }),
  ).toBeVisible();

  // Selecting one registry rule makes it saveable…
  await page.getByRole('checkbox', { name: 'Email address' }).check();
  await expect(page.getByText('create a Cloak List instead')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Save pack' })).toBeEnabled();

  // …and so does one valid labeled-field rule instead.
  await page.getByRole('checkbox', { name: 'Email address' }).uncheck();
  await expect(page.getByRole('button', { name: 'Save pack' })).toBeDisabled();
  await page.getByRole('button', { name: 'Add labeled-field rule' }).click();
  await page.getByLabel('Custom rule name').fill('Badge number');
  await page.getByLabel('Field labels').fill('BadgeId');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await expect(page.getByRole('button', { name: 'Save pack' })).toBeEnabled();
});

test('no visible "Private Terms" wording remains on user-facing pages', async ({ page }) => {
  const routes = [
    '/#/scan',
    '/#/settings/general',
    '/#/settings/profiles',
    '/#/settings/rules',
    '/#/settings/redaction',
    '/#/settings/privacy',
    '/#/about',
  ];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('body')).not.toContainText(/private terms?/i);
  }

  // Also inside the custom terms dialog and both editors.
  await page.goto('/#/scan');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await expect(page.locator('body')).not.toContainText(/private terms?/i);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await expect(page.locator('body')).not.toContainText(/private terms?/i);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await expect(page.locator('body')).not.toContainText(/private terms?/i);
});

test('opening an editor resets the settings page scroll to the top', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 500 });
  await page.goto('/#/settings/profiles');
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);

  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await expect(page.getByRole('heading', { name: 'Create Custom Pack' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await expect(page.getByRole('heading', { name: 'Create Cloak List' })).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  // Title, privacy status, and both controls are immediately visible.
  await expect(page.getByRole('button', { name: 'Save Cloak List' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'Cancel' })).toBeInViewport();
});

test('clear preferences removes both storage keys and all saved data', async ({ page }) => {
  await page.goto('/#/settings/general');
  await page.getByRole('switch', { name: 'Remember preferences on this device' }).click();
  await page.evaluate(() => localStorage.setItem('cloakguard.prefs.v1', '{"version":1}'));

  await page.goto('/#/settings/privacy');
  await page.getByRole('button', { name: 'Clear preferences' }).click();
  expect(await page.evaluate(() => localStorage.length)).toBe(0);
  await expect(page.getByText('Preference storage is OFF.')).toBeVisible();
});
