import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Documentation screenshots. Only runs with SCREENSHOTS=1 so normal e2e runs
 * do not churn the repo. Captures each Settings section and the About page
 * at 1440x900 (scan-screen sizes are covered by viewports.spec.ts).
 */
test.skip(process.env.SCREENSHOTS !== '1', 'set SCREENSHOTS=1 to capture');

const SHOTS: { name: string; path: string; ready: string }[] = [
  { name: 'settings-general', path: '/#/settings/general', ready: 'Core detection mode' },
  { name: 'settings-profiles-packs', path: '/#/settings/profiles', ready: 'Policy packs improve' },
  { name: 'settings-rules', path: '/#/settings/rules', ready: 'Detection Rules' },
  { name: 'settings-formats', path: '/#/settings/formats', ready: 'Redaction Formats' },
  { name: 'settings-privacy', path: '/#/settings/privacy', ready: 'Preference storage' },
  { name: 'about', path: '/#/about', ready: 'Privacy model' },
];

for (const shot of SHOTS) {
  test(`capture ${shot.name}`, async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(shot.path);
    await expect(page.getByText(shot.ready).first()).toBeVisible();
    if (shot.name === 'settings-rules') {
      // Open a detail panel so the screenshot shows the full layout.
      await page.getByRole('button', { name: /^Email address/ }).click();
      await expect(page.getByText('What it detects')).toBeVisible();
    }
    if (shot.name === 'settings-profiles-packs') {
      await page
        .getByRole('switch', { name: 'Enable pack Canada Pack in the active profile' })
        .check();
      await page.getByLabel('New profile name').fill('Sharing profile');
      await page.getByRole('button', { name: 'Create profile from current configuration' }).click();
      await expect(page.getByText('Profile "Sharing profile" created.')).toBeHidden({
        timeout: 5_000,
      });
      await page.getByRole('button', { name: 'Details' }).first().click();
    }
    mkdirSync('docs/screenshots', { recursive: true });
    await page.screenshot({ path: `docs/screenshots/${shot.name}-1440x900.png`, fullPage: true });
  });
}

test('capture custom pack builder and rule editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Custom Pack' }).click();
  await page.getByLabel('Pack name').fill('Helpdesk pack');
  await page.getByLabel('Pack cloak terms').fill('Contoso General\nsrv-app01');
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/custom-pack-builder-1440x900.png', fullPage: true });

  await page.getByRole('button', { name: 'Add labeled-field rule' }).click();
  await page.getByLabel('Custom rule name').fill('Badge number');
  await page.getByLabel('Field labels').fill('BadgeId\nBadge Number');
  await page.getByLabel('Placeholder label').fill('BADGE_ID');
  await expect(page.locator('.rule-preview-after')).toContainText('[BADGE_ID_1]');
  await page.screenshot({ path: 'docs/screenshots/custom-rule-editor-1440x900.png', fullPage: true });
});

test('capture custom terms dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page
    .getByRole('textbox', { name: 'Custom terms to hide' })
    .fill('Contoso General\ncontoso.org\nSRV-APP01\ncontoso.org');
  await expect(page.getByText('3 valid terms')).toBeVisible();
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/quick-cloak-1440x900.png', fullPage: true });
});

test('capture cloak list editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/settings/profiles');
  await page.getByRole('button', { name: 'Create Cloak List' }).click();
  await page.getByLabel('Cloak List name').fill('Org names');
  await page.getByLabel('Cloak List terms').fill('Contoso General\ncontoso.org\nSRV-APP01');
  await expect(page.getByText('3 valid terms')).toBeVisible();
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/cloak-list-editor-1440x900.png', fullPage: true });
});

test('capture profile editor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/#/settings/profiles');
  await page.getByLabel('New profile name').fill('Sharing profile');
  await page.getByRole('button', { name: 'Create profile from current configuration' }).click();
  await page.getByRole('button', { name: 'Edit profile Sharing profile' }).click();
  await page
    .getByLabel('Profile description')
    .fill('Synthetic demo: sanitizing logs before sharing them outside the team');
  await page.getByRole('checkbox', { name: 'Include pack Canada Pack in this profile' }).check();
  await expect(page.getByTestId('profile-editor-rule-counts')).toContainText('rules enabled');
  // Let the transient profile-created notice disappear before capturing.
  await expect(page.getByText('created.')).toBeHidden({ timeout: 10000 });
  mkdirSync('docs/screenshots', { recursive: true });
  await page.screenshot({ path: 'docs/screenshots/profile-editor-1440x900.png', fullPage: true });
});
