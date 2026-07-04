import type { Route } from '../hooks/useHashRoute';
import { ShieldLogo } from './ShieldLogo';

interface HeaderProps {
  route: Route;
}

const NAV_ITEMS: { label: string; href: string; view: Route['view'] }[] = [
  { label: 'Scan', href: '#/scan', view: 'scan' },
  { label: 'Settings', href: '#/settings/general', view: 'settings' },
  { label: 'Privacy / About', href: '#/about', view: 'about' },
];

export function Header({ route }: HeaderProps) {
  return (
    <header className="header">
      <div className="header-left">
        <a className="brand" href="#/scan">
          <ShieldLogo />
          <span className="brand-name">CloakGuard</span>
        </a>
        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.view}
              href={item.href}
              className={`nav-link ${route.view === item.view ? 'is-active' : ''}`}
              aria-current={route.view === item.view ? 'page' : undefined}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </div>
      <div className="header-right">
        <span className="badge">
          <svg viewBox="0 0 16 16" className="badge-icon" aria-hidden="true">
            <path d="M3 8.5 6.5 12 13 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Local-first
        </span>
        <span className="badge">
          <svg viewBox="0 0 16 16" className="badge-icon" aria-hidden="true">
            <path d="M8 1.5 13.5 4v4c0 3.2-2.3 5.6-5.5 6.5C4.8 13.6 2.5 11.2 2.5 8V4L8 1.5Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          No cloud upload
        </span>
        <span className="badge">
          <svg viewBox="0 0 16 16" className="badge-icon" aria-hidden="true">
            <path d="m6 4-4 4 4 4M10 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Open source
        </span>
      </div>
    </header>
  );
}
