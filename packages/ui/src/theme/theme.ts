export const THEME_STORAGE_KEY = 'mimir-theme';

export const THEME_CHOICES = ['light', 'dark', 'system'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

const DARK_QUERY = '(prefers-color-scheme: dark)';

/**
 * Runs from an inline script in `<head>`, before first paint, so a stored dark
 * theme never flashes light. It cannot import anything, so it repeats
 * `readThemeChoice` and `applyTheme` in plain JavaScript.
 */
export const THEME_INIT_SCRIPT = `(function () {
  var choice;
  try {
    choice = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  } catch (e) {}
  var theme =
    choice === 'light' || choice === 'dark'
      ? choice
      : matchMedia(${JSON.stringify(DARK_QUERY)}).matches
        ? 'dark'
        : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
})();`;

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {
    // Blocked storage: the theme still works for this session.
  }
  return 'system';
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Blocked storage: the theme still works for this session.
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const theme =
    choice === 'system'
      ? matchMedia(DARK_QUERY).matches
        ? 'dark'
        : 'light'
      : choice;
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}

/** Calls back when the system theme changes; returns the unsubscribe. */
export function onSystemThemeChange(callback: () => void): () => void {
  const query = matchMedia(DARK_QUERY);
  query.addEventListener('change', callback);
  return () => query.removeEventListener('change', callback);
}
