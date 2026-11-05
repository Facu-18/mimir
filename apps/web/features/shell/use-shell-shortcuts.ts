'use client';

import { useEffect } from 'react';
import { useGuardedNavigate } from './navigation-guard';
import { APP_ROUTES } from './routes';
import { useShellStore } from './shell-store';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
  );
}

export function useShellShortcuts(): void {
  const navigate = useGuardedNavigate();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // Ctrl+B means bold in an editor, and a modal owns the keyboard.
      if (isTyping(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) {
        return;
      }

      const { toggleSidebar, togglePanel } = useShellStore.getState();
      if (event.ctrlKey || event.metaKey) {
        if (event.key === 'b') {
          event.preventDefault();
          toggleSidebar();
        } else if (event.key === '.') {
          event.preventDefault();
          togglePanel();
        }
        return;
      }
      // By physical key: on a Mac, Alt+1 types a symbol instead of a digit.
      const digit = /^Digit([1-9])$/.exec(event.code);
      if (event.altKey && digit) {
        const route = APP_ROUTES[Number(digit[1]) - 1];
        if (route) {
          event.preventDefault();
          navigate(route.href);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navigate]);
}
