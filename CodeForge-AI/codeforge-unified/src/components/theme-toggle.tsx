'use client';

import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  function syncTheme(event: StorageEvent) {
    if (event.key === 'pv_theme' || event.key === null) {
      document.documentElement.dataset.theme = event.newValue === 'light' ? 'light' : 'dark';
    }
  }
  window.addEventListener('storage', syncTheme);
  return () => { observer.disconnect(); window.removeEventListener('storage', syncTheme); };
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme ?? 'dark', () => 'dark');
  const label = `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`;
  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pv_theme', next); } catch { /* The theme works without persistent storage. */ }
  }
  return <button type="button" className="icon-button theme-toggle" onClick={toggle} aria-label={label} title={label}>
    <Sun size={18} className="theme-light-icon" aria-hidden="true" />
    <Moon size={18} className="theme-dark-icon" aria-hidden="true" />
  </button>;
}
