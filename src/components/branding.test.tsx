import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AboutView } from './AboutView';
import { Wordmark } from './Wordmark';

describe('Wordmark', () => {
  it('has one accessible CloakGuard name while keeping the colored parts decorative', () => {
    const html = renderToStaticMarkup(<Wordmark />);
    expect(html).toContain('aria-label="CloakGuard"');
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
