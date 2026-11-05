import { act, render } from '@testing-library/react';
import { ThemeSync } from './theme-sync';
import { THEME_STORAGE_KEY } from './theme';

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
  return {
    set(next: 'light' | 'dark') {
      query.matches = next === 'dark';
      listeners.forEach((listener) => listener());
    },
    listeners,
  };
}

const theme = () => document.documentElement.dataset.theme;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ThemeSync', () => {
  it('follows the system with no theme switcher on the page', () => {
    const system = mockSystemTheme('light');
    render(<ThemeSync />);

    act(() => system.set('dark'));

    expect(theme()).toBe('dark');
  });

  it('catches a system change that happened before it mounted', () => {
    mockSystemTheme('light');
    document.documentElement.dataset.theme = 'dark';

    render(<ThemeSync />);

    expect(theme()).toBe('light');
  });

  it('leaves an explicit choice alone', () => {
    const system = mockSystemTheme('light');
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    render(<ThemeSync />);

    act(() => system.set('dark'));

    expect(theme()).toBe('light');
  });

  it('stops listening when unmounted', () => {
    const system = mockSystemTheme('light');
    const { unmount } = render(<ThemeSync />);

    unmount();

    expect(system.listeners.size).toBe(0);
  });
});
