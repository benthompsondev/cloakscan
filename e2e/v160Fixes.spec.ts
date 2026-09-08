import { expect, test, type Page } from '@playwright/test';

type ProfileKind = 'unsaved' | 'named';

async function configureCloakList(page: Page, profileKind: ProfileKind) {
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Client names');
  await page.getByLabel('Cloak List terms').fill('Contoso General');
  await page.getByRole('button', { name: 'Save Cloak List' }).click();
  await page
    .getByRole('switch', { name: 'Enable Cloak List Client names in the active profile' })
    .check();

  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await page.getByLabel('Pack name').fill('Client fields');
  await page.getByRole('button', { name: 'Add labeled-field rule' }).click();
  await page.getByLabel('Custom rule name').fill('Badge number');
  await page.getByLabel('Field labels').fill('BadgeId');
  await page.getByLabel('Placeholder label').fill('BADGE_ID');
  await page.getByRole('button', { name: 'Save rule' }).click();
  await page.getByRole('button', { name: 'Save pack' }).click();
  await page
    .getByRole('switch', { name: 'Enable pack Client fields in the active profile' })
    .check();

  if (profileKind === 'named') {
    await page.getByLabel('New profile name').fill('Client sharing');
    await page
      .getByRole('button', { name: 'Create profile from current configuration' })
      .click();
  }

  await page.goto('/#/settings/formats');
  await page.getByRole('radio', { name: /^Uniform replacement/ }).check();
  await page.goto('/#/settings/rules');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
}

for (const profileKind of ['unsaved', 'named'] as const) {
  for (const outputMode of ['Safe-share', 'Portfolio-code'] as const) {
    test(`${profileKind} Cloak List survives Enable all in ${outputMode}`, async ({ page }) => {
      await configureCloakList(page, profileKind);
      const profileBefore = await page.getByLabel('Detection profile').inputValue();

      await page.getByRole('button', { name: outputMode, exact: true }).click();
      await page.getByRole('button', { name: /Hide custom terms/ }).click();
      await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('Project Nightjar');
      await page.getByRole('button', { name: 'Done' }).click();
      await page
        .getByLabel('Source text input')
        .fill(
          'Contoso General owns Project Nightjar. BadgeId: 998877. Contact alex.demo@example.com.',
        );
      await page.getByRole('button', { name: 'Scan locally' }).click();

      const output = page.getByLabel('Sanitized output with placeholders');
      await expect(output).not.toContainText('Contoso General');
      await expect(output).not.toContainText('Project Nightjar');
      await expect(output).not.toContainText('998877');
      await expect(output).toContainText('alex.demo@example.com');

      await page.getByRole('button', { name: 'Enable all built-in rules' }).click();

      await expect(page.getByLabel('Detection profile')).toHaveValue(profileBefore);
      await expect(page.getByLabel('Active packs')).toContainText('Client names · Cloak List');
      await expect(page.getByLabel('Active packs')).toContainText('Client fields');
      await expect(page.getByText('Local scan complete')).toBeHidden();
      await expect(page.getByText('49 of 49 rules')).toBeVisible();

      await page.getByRole('button', { name: 'Scan locally' }).click();
      await expect(output).not.toContainText('Contoso General');
      await expect(output).not.toContainText('Project Nightjar');
      await expect(output).not.toContainText('998877');
      await expect(output).not.toContainText('alex.demo@example.com');
      await expect(output).toContainText('[REDACTED]');
    });
  }
}

test('disabled-rule explanation remembers dismissal and reopens for changed identities', async ({
  page,
}) => {
  await page.goto('/#/');
  const explanation = page.getByRole('alert', { name: 'Disabled sensitive-data rules' });
  await expect(explanation).toContainText('16 sensitive-data rules are off');

  await page.getByRole('button', { name: 'Hide coverage details' }).click();
  const compact = page.getByRole('note', { name: 'Limited sensitive-data coverage' });
  await expect(compact).toContainText('16 sensitive-data rules are off');
  await page.getByRole('button', { name: 'Show coverage details' }).click();
  await expect(explanation).toBeVisible();
  await page.getByRole('button', { name: 'Hide coverage details' }).click();

  await page.getByRole('button', { name: 'Portfolio-code', exact: true }).click();
  await page.getByLabel('Source text input').fill('DOB: 1988-03-19');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(compact).toBeVisible();
  await expect(page.getByRole('region', { name: 'Sanitization readiness' })).toContainText(
    '16 sensitive-data rules disabled',
  );

  await page.getByRole('link', { name: 'Privacy / About' }).click();
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(compact).toBeVisible();

  await page.goto('/#/settings/rules');
  await page.getByRole('switch', { name: 'Enable rule Email address' }).uncheck();
  await page.getByRole('switch', { name: 'Enable rule Date of birth (labeled field)' }).check();
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(explanation).toContainText('16 sensitive-data rules are off');

  await page.getByRole('button', { name: 'Hide coverage details' }).click();
  await page.reload();
  await expect(explanation).toBeVisible();
  await page.getByRole('button', { name: 'Hide coverage details' }).click();
  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(explanation).toBeVisible();

  await page.getByRole('button', { name: 'Enable all built-in rules' }).click();
  await expect(explanation).toBeHidden();
  await expect(compact).toBeHidden();
});

test('general review reminder dismissal lasts for the session and Clear session resets it', async ({
  page,
}) => {
  await page.goto('/#/');
  const reminder = page.getByRole('note', { name: 'Detection reminder' });
  await page.getByRole('button', { name: 'Hide detection reminder' }).click();
  await expect(reminder).toBeHidden();

  await page.getByLabel('Source text input').fill('Contact alex.demo@example.internal');
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await page.getByRole('button', { name: 'Portfolio-code', exact: true }).click();
  await page.getByLabel('Detection profile').selectOption('strict');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await page.goBack();
  await expect(reminder).toBeHidden();
  await page.getByRole('link', { name: 'Privacy / About' }).click();
  await page.getByRole('link', { name: 'Scan', exact: true }).click();
  await expect(reminder).toBeHidden();
  await page.getByRole('button', { name: 'New Scan' }).click();
  await expect(reminder).toBeHidden();

  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(reminder).toBeVisible();
  await page.getByRole('button', { name: 'Hide detection reminder' }).click();
  await page.reload();
  await expect(reminder).toBeVisible();
  await expect(page.locator('.footer')).toContainText('Review before sharing');
});

test('custom-terms dialog traps both Tab directions and blocks background keyboard actions', async ({
  page,
}) => {
  await page.goto('/#/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  const opener = page.getByRole('button', { name: /Hide custom terms/ });
  await opener.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Custom terms to hide' });
  const done = dialog.getByRole('button', { name: 'Done' });
  const last = dialog.getByRole('link', { name: 'Manage reusable Cloak Lists' });
  await expect(dialog.getByRole('textbox', { name: 'Custom terms to hide' })).toBeFocused();

  await done.focus();
  await page.keyboard.press('Shift+Tab');
  await expect(last).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(done).toBeFocused();

  for (let index = 0; index < 20; index += 1) {
    await page.keyboard.press(index % 2 === 0 ? 'Tab' : 'Shift+Tab');
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }

  const backgroundControls = [
    page.locator('#root button').filter({ hasText: 'Copy clean text' }),
    page.locator('#root button').filter({ hasText: 'Download .txt' }),
    page.locator('#root button').filter({ hasText: /^Export$/ }).first(),
  ];
  for (const control of backgroundControls) {
    await control.evaluate((element) => (element as HTMLElement).focus());
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
  await expect(page.getByText('Cleaned text copied to clipboard.')).toBeHidden();

  const about = page.locator('#root a[href="#/about"]');
  await about.evaluate((element) => (element as HTMLElement).focus());
  expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  await expect(page).toHaveURL(/#\/$/);

  await dialog.getByLabel('Custom term placeholder label').focus();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
