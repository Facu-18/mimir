'use client';

import { useEffect } from 'react';
import { applyTheme, onSystemThemeChange, readThemeChoice } from './theme';

/**
 * Keeps the page on the chosen theme. It belongs in the root layout, so the
 * app follows the system on every screen, whether or not a switcher is shown.
 */
export function ThemeSync() {
  useEffect(() => {
    const sync = () => applyTheme(readThemeChoice());
    // The system may have changed between the inline script and this mount.
    sync();
    return onSystemThemeChange(sync);
  }, []);

  return null;
}
