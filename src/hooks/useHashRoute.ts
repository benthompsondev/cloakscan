import { useSyncExternalStore } from 'react';

/**
 * Tiny hash-based navigation — no routing dependency needed for three views.
 * Routes: #/scan (default), #/settings/<section>, #/about.
 */

export type SettingsSection = 'general' | 'profiles' | 'rules' | 'formats' | 'privacy';

export type Route =
  | { view: 'scan' }
  | { view: 'settings'; section: SettingsSection }
  | { view: 'about' };

const SECTIONS: SettingsSection[] = ['general', 'profiles', 'rules', 'formats', 'privacy'];

export function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  if (parts[0] === 'settings') {
    const section = SECTIONS.includes(parts[1] as SettingsSection)
      ? (parts[1] as SettingsSection)
      : 'general';
    return { view: 'settings', section };
  }
  if (parts[0] === 'about') return { view: 'about' };
  return { view: 'scan' };
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export function useHashRoute(): Route {
  const hash = useSyncExternalStore(
    subscribe,
    () => window.location.hash,
    () => '',
  );
  return parseHash(hash);
}
