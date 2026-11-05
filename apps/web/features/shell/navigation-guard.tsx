'use client';

import { ConfirmDialog } from '@mimir/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';

type GuardStore = {
  sources: number;
  pending: (() => void) | null;
  add: () => void;
  remove: () => void;
  ask: (action: () => void) => void;
  cancel: () => void;
  discard: () => void;
};

const useGuardStore = create<GuardStore>((set) => ({
  sources: 0,
  pending: null,
  add: () => set((state) => ({ sources: state.sources + 1 })),
  remove: () => set((state) => ({ sources: Math.max(0, state.sources - 1) })),
  ask: (action) => set({ pending: action }),
  cancel: () => set({ pending: null }),
  discard: () => set({ sources: 0, pending: null }),
}));

/** Protects a screen's edits: while `dirty`, leaving it asks first. */
export function useUnsavedChanges(dirty: boolean): void {
  const add = useGuardStore((state) => state.add);
  const remove = useGuardStore((state) => state.remove);

  useEffect(() => {
    if (!dirty) return;
    add();
    return remove;
  }, [dirty, add, remove]);
}

/** Navigates, asking first if a screen has unsaved changes. */
export function useGuardedNavigate(): (href: string) => void {
  const router = useRouter();
  return useCallback(
    (href) => {
      const { sources, ask } = useGuardStore.getState();
      const go = () => router.push(href);
      if (sources > 0) ask(go);
      else go();
    },
    [router],
  );
}

function internalTarget(event: MouseEvent): string | null {
  if (event.defaultPrevented || event.button !== 0) return null;
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) {
    return null;
  }
  const anchor = (event.target as Element).closest?.('a[href]');
  if (!(anchor instanceof HTMLAnchorElement)) return null;
  if (anchor.target && anchor.target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  const url = new URL(anchor.href);
  if (url.origin !== location.origin) return null;
  const samePage =
    url.pathname === location.pathname && url.search === location.search;
  return samePage ? null : url.pathname + url.search + url.hash;
}

/**
 * Next has no API to block navigation, so this does it from the outside:
 * - Links: a capture listener stops the click before Next's handler sees it.
 * - Back: while dirty, a duplicate history entry sits on top of the page, so
 *   Back lands on the same URL. The listener puts the entry back and asks.
 * - Reload and closing: the browser's own prompt.
 */
export function NavigationGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const dirty = useGuardStore((state) => state.sources > 0);
  const pending = useGuardStore((state) => state.pending);
  const leaving = useRef(false);

  useEffect(() => {
    leaving.current = false;
  }, [pathname]);

  useEffect(() => {
    if (!dirty) return;
    const { ask } = useGuardStore.getState();

    const onClick = (event: MouseEvent) => {
      const href = internalTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      ask(() => router.push(href));
    };
    const onPopState = () => {
      history.pushState(history.state, '', location.href);
      // Two steps: the restored entry, then the one holding this same page.
      ask(() => history.go(-2));
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    document.documentElement.dataset.unsavedChanges = 'true';
    history.pushState(history.state, '', location.href);
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      delete document.documentElement.dataset.unsavedChanges;
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Saved, not leaving: drop the extra entry so Back takes one press.
      if (!leaving.current) history.back();
    };
  }, [dirty, router]);

  return (
    <ConfirmDialog
      open={pending !== null}
      title="Discard changes?"
      description="You have unsaved changes on this page. They will be lost if you leave."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onCancel={() => useGuardStore.getState().cancel()}
      onConfirm={() => {
        const action = useGuardStore.getState().pending;
        leaving.current = true;
        useGuardStore.getState().discard();
        action?.();
      }}
    />
  );
}
