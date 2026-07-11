import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutView } from './AboutView';
import { Wordmark } from './Wordmark';

const root = join(__dirname, '..', '..');

describe('Wordmark', () => {
  it('has one accessible CloakScan name while keeping the colored parts decorative', () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toContain('aria-label="CloakScan"');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
    expect(html).toContain('wordmark-accent');
  });
});

describe('AboutView updater visibility', () => {
  const props = {
    remember: false,
    onClearPreferences: () => undefined,
  };

  it('does not render update controls in browser builds', () => {
    const html = renderToStaticMarkup(<AboutView {...props} isDesktop={false} />);
    expect(html).not.toContain('Check for updates');
    expect(html).not.toContain('Download and install');
  });

  it('renders user-triggered update controls in the desktop app', () => {
    const html = renderToStaticMarkup(<AboutView {...props} isDesktop />);
    expect(html).toContain('Check for updates');
    expect(html).toContain('only when you click it');
  });
});

describe('public demo media', () => {
  it('ships a correctly sized social card and points the page metadata at it', () => {
    const card = readFileSync(join(root, 'docs', 'media', 'social-card.png'));
    expect(card.subarray(1, 4).toString('ascii')).toBe('PNG');
    expect(card.readUInt32BE(16)).toBe(1280);
    expect(card.readUInt32BE(20)).toBe(640);

    const index = readFileSync(join(root, 'index.html'), 'utf8');
    expect(index).toContain('docs/media/social-card.png');
    expect(index).toContain('property="og:image:width" content="1280"');
    expect(index).toContain('property="og:image:height" content="640"');
    expect(index).toContain('name="theme-color" content="#0d1112"');
  });

  it('keeps the short GIF near the top of the README before the static screenshot', () => {
    const gif = readFileSync(join(root, 'docs', 'media', 'cloakscan-demo.gif'));
    expect(gif.subarray(0, 6).toString('ascii')).toMatch(/^GIF8[79]a$/);
    expect(gif.length).toBeLessThan(4 * 1024 * 1024);

    const readme = readFileSync(join(root, 'README.md'), 'utf8');
    expect(readme.indexOf('docs/media/cloakscan-demo.gif')).toBeGreaterThan(-1);
    expect(readme.indexOf('docs/media/cloakscan-demo.gif')).toBeLessThan(
      readme.indexOf('docs/screenshots/scan-desktop-1440x900.png'),
    );
  });
});
