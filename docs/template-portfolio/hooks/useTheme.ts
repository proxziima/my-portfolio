'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const read = (): Theme => {
  if (typeof document === 'undefined') return 'light';
  const stamped = document.documentElement.getAttribute('data-theme');
  if (stamped === 'dark' || stamped === 'light') return stamped;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/** Owns <html data-theme>. The initial value is already on the element thanks to
 *  the blocking script in app/layout.tsx, so there is no flash. */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    setTheme(read());
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onSystem = () => setTheme(read());
    mq.addEventListener('change', onSystem);
    const mo = new MutationObserver(() => setTheme(read()));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => {
      mq.removeEventListener('change', onSystem);
      mo.disconnect();
    };
  }, []);

  /** Stamp the root and open the 380ms colour transition window. */
  const apply = useCallback((next: Theme, withTransition = true) => {
    const root = document.documentElement;
    if (withTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      root.dataset.themeTransition = 'true';
      void root.offsetWidth;
      window.clearTimeout((root as any)._tt);
      (root as any)._tt = window.setTimeout(() => delete root.dataset.themeTransition, 380);
    }
    root.setAttribute('data-theme', next);
    try {
      localStorage.setItem('rl-theme', next);
    } catch {}
    setTheme(next);
  }, []);

  return { theme, apply, isDark: theme === 'dark' };
}
