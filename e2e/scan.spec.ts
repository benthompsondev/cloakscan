import { test, expect, type Page } from '@playwright/test';
import { SYNTHETIC_STRIPE_SHAPED_KEY } from '../src/lib/synthetic';

async function loadDemoAndScan(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();
}

test('loads the demo and scans it locally', async ({ page }) => {
  await loadDemoAndScan(page);

  await expect(page.getByRole('region', { name: /Redacted preview/i })).toContainText('[EMAIL_1]');
  await expect(page.getByRole('heading', { name: 'Findings' })).toBeVisible();
  await expect(page.getByText('Local scan complete')).toBeVisible();
  // Repeated demo email shares one placeholder: [EMAIL_1] appears, [EMAIL_2] does not.
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).not.toContainText('[EMAIL_2]');
  await expect(preview).not.toContainText('alex.demo@example.internal');
});

test('toggling a finding restores the original value in the preview', async ({ page }) => {
  await loadDemoAndScan(page);
  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).not.toContainText('alex.demo@example.internal');

  await page.getByRole('switch', { name: /Redact Email address/i }).click();
  await expect(preview).toContainText('alex.demo@example.internal');
  await expect(preview).not.toContainText('[EMAIL_1]');

  await page.getByRole('switch', { name: /Redact Email address/i }).click();
  await expect(preview).toContainText('[EMAIL_1]');
});

test('findings are organized into collapsible category sections', async ({ page }) => {
  await loadDemoAndScan(page);
  const secrets = page.getByRole('button', { name: /Secrets \(/ });
  await expect(secrets).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Bearer token')).toBeVisible();

  await secrets.click();
  await expect(secrets).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Bearer token')).toBeHidden();
  // Other sections stay open.
  await expect(page.getByText('Windows user path')).toBeVisible();

  await secrets.click();
  await expect(page.getByText('Bearer token')).toBeVisible();
});

test('imports a text file from memory', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import a text file').setInputFiles({
    name: 'server.log',
    mimeType: 'text/plain',
    buffer: Buffer.from('error at 10.9.8.7 contact ops@example.internal\n'),
  });
  await expect(page.getByText('Imported server.log')).toBeVisible();
  await page.getByRole('button', { name: 'Scan locally' }).click();
  await expect(page.getByRole('region', { name: /Redacted preview/i })).toContainText(
    '[IP_ADDRESS_1]',
  );
});

test('PII sample with the scan-toolbar Strict profile redacts labeled PII', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'PII sample' }).click();
  await page.getByLabel('Detection profile').selectOption('strict');
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const preview = page.getByRole('region', { name: /Redacted preview/i });
  for (const placeholder of [
    '[NAME_1]',
    '[DOB_1]',
    '[PHONE_1]',
    '[ADDRESS_1]',
    '[SIN_1]',
    '[HEALTH_ID_1]',
    '[CREDIT_CARD_1]',
    '[ORG_1]',
  ]) {
    await expect(preview).toContainText(placeholder);
  }
  // Free text is never guessed at, even in Strict.
  await expect(preview).toContainText('escalate to Dr. Demo');
});

test('category Redact all / Keep all toggle a whole section', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Load sample' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[API_KEY_1]');

  await page.getByRole('button', { name: 'Keep all Secrets findings as-is' }).click();
  await expect(preview).not.toContainText('[API_KEY_1]');
  await expect(preview).toContainText(SYNTHETIC_STRIPE_SHAPED_KEY);
  // Other categories are untouched.
  await expect(preview).toContainText('[EMAIL_1]');

  await page.getByRole('button', { name: 'Redact all Secrets findings' }).click();
  await expect(preview).toContainText('[API_KEY_1]');
});

test('imports a synthetic UTF-16 PowerShell script and finds admin shapes', async ({ page }) => {
  const script = [
    '$SmtpUserPass = "demo-secret-not-real"',
    'Import-Csv -Path "\\\\fs01\\Deploy$\\uploads\\accounts.csv"',
    'Move-ADObject -TargetPath "OU=Terminated Users,DC=ad,DC=example,DC=test"',
    '$TenantId = "aaaabbbb-1111-2222-3333-ccccdddd0000"',
    'Get-ADUser -Identity jdemo -Server dc01.example.test',
  ].join('\r\n');
  // PowerShell-style UTF-16LE with BOM.
  const buffer = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(script, 'utf16le')]);

  await page.goto('/');
  await page.getByLabel('Import a text file').setInputFiles({
    name: 'Invoke-DemoOnboarding.ps1',
    mimeType: 'application/octet-stream',
    buffer,
  });
  await expect(page.getByText('Imported Invoke-DemoOnboarding.ps1')).toBeVisible();
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[SECRET_1]');
  await expect(preview).toContainText('[UNC_PATH_1]');
  await expect(preview).toContainText('[AD_DN_1]');
  await expect(preview).toContainText('[GUID_1]');
  await expect(preview).not.toContainText('demo-secret-not-real');
});

test('custom terms to hide are redacted and cleared with the session', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Source text input').fill('Contoso General ticket about the Contoso portal');
  await page.getByRole('button', { name: /Hide custom terms/ }).click();
  await page.getByRole('textbox', { name: 'Custom terms to hide' }).fill('Contoso');
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Scan locally' }).click();

  const preview = page.getByRole('region', { name: /Redacted preview/i });
  await expect(preview).toContainText('[CUSTOM_TERM_1] General ticket about the [CUSTOM_TERM_1] portal');

  await page.getByRole('button', { name: 'Clear session' }).click();
  // Re-open the dialog: the terms are gone along with the content.
  await page.getByRole('button', { name: 'Hide custom terms' }).click();
  await expect(page.getByRole('textbox', { name: 'Custom terms to hide' })).toHaveValue('');
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByLabel('Source text input')).toHaveValue('');
});

test('rejects unsupported file types with feedback', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import a text file').setInputFiles({
    name: 'image.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
  });
  await expect(page.getByText(/Unsupported file type/)).toBeVisible();
});

test('copy shows success feedback and puts cleaned text on the clipboard', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await loadDemoAndScan(page);
  await page.getByRole('button', { name: 'Copy clean text' }).click();
  await expect(page.getByText('Cleaned text copied to clipboard.')).toBeVisible();
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard).toContain('[EMAIL_1]');
  expect(clipboard).not.toContain('alex.demo@example.internal');
});

test('downloads the cleaned text as a .txt file', async ({ page }) => {
  await loadDemoAndScan(page);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .txt' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('cloakguard-clean.txt');
});

test('clear session wipes source, findings, and preview', async ({ page }) => {
  await loadDemoAndScan(page);
  await page.getByRole('button', { name: 'Clear session' }).click();
  await expect(page.getByRole('heading', { name: 'Findings' })).toBeHidden();
  await expect(page.getByText('Run a scan to see the sanitized version here.')).toBeVisible();
  await expect(page.getByLabel('Source text input')).toHaveValue('');
});

test('production app contacts no non-local origin', async ({ page }) => {
  const externalRequests: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    const local =
      url.protocol === 'blob:' ||
      url.protocol === 'data:' ||
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost';
    if (!local) externalRequests.push(request.url());
  });

  await loadDemoAndScan(page);
  await page.getByRole('switch', { name: /Redact IPv4 address/i }).first().click();
  await page.getByRole('button', { name: 'Download .txt' }).click();
  await page.getByRole('button', { name: 'Clear session' }).click();

  expect(externalRequests).toEqual([]);
});

test('strict CSP meta tag is present in the production build', async ({ page }) => {
  await page.goto('/');
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("connect-src 'none'");
});
