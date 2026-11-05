import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeSwitcher } from './theme-switcher';
import { THEME_INIT_SCRIPT, THEME_STORAGE_KEY } from './theme';

function mockSystemTheme(initial: 'light' | 'dark') {
  const listeners = new Set<() => void>();
  const query = {
    matches: initial === 'dark',
    addEventListener: (_: string, listener: () => void) =>
      listeners.add(listener),
    removeEventListener: (_: string, listener: () => void) =>
      listeners.delete(listener),
  };
  vi.stubGlobal('matchMedia', () => query);
  return (next: 'light' | 'dark') => {
    query.matches = next === 'dark';
    listeners.forEach((listener) => listener());
  };
}

const root = () => document.documentElement;
// oxlint-disable-next-line typescript/no-implied-eval -- runs the real inline script
const runInitScript = () => new Function(THEME_INIT_SCRIPT)();

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('THEME_INIT_SCRIPT', () => {
  it('applies a stored theme', () => {
    mockSystemTheme('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');

    runInitScript();

    expect(root().dataset.theme).toBe('light');
    expect(root().style.colorScheme).toBe('light');
  });

  it('follows the system without a stored choice', () => {
    mockSystemTheme('dark');

    runInitScript();

    expect(root().dataset.theme).toBe('dark');
  });

  it('ignores an invalid stored value', () => {
    mockSystemTheme('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');

    runInitScript();

    expect(root().dataset.theme).toBe('dark');
  });

  it('survives blocked storage', () => {
    mockSystemTheme('dark');
    vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });

    expect(runInitScript).not.toThrow();
    expect(root().dataset.theme).toBe('dark');
  });
});

describe('ThemeSwitcher', () => {
  it('offers the three choices with system selected by default', () => {
    mockSystemTheme('light');

    render(<ThemeSwitcher />);

    expect(screen.getByRole('radio', { name: 'Light' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Dark' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  it('applies and stores the choice', async () => {
    mockSystemTheme('light');
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(root().dataset.theme).toBe('dark');
    expect(root().style.colorScheme).toBe('dark');
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  it('still changes the theme when storage is blocked', async () => {
    mockSystemTheme('light');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    render(<ThemeSwitcher />);

    await userEvent.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(root().dataset.theme).toBe('dark');
  });
});
