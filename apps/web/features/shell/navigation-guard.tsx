'use client';

import { ConfirmDialog } from '@mimir/ui';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { GUARD_POPSTATE_HANDLER } from './guard-init';

/** Marks the history entry the guard keeps on top of a page with edits. */
const GUARD_TAG = 'mimirGuard';

/** How long a Back can take to leave the page before Discard counts as failed. */
const BACK_SETTLE_MS = 500;

type PendingExit =
  { kind: 'push'; href: string } | { kind: 'back'; delta: number };

type GuardStore = {
  sources: number;
  pending: PendingExit | null;
  add: () => void;
  remove: () => void;
  ask: (exit: PendingExit) => void;
  close: () => void;
};

const useGuardStore = create<GuardStore>((set) => ({
  sources: 0,
  pending: null,
  add: () => set((state) => ({ sources: state.sources + 1 })),
  remove: () => set((state) => ({ sources: Math.max(0, state.sources - 1) })),
  ask: (exit) => set({ pending: exit }),
  close: () => set({ pending: null }),
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
      if (sources > 0) ask({ kind: 'push', href });
      else router.push(href);
    },
    [router],
  );
}

const onGuardEntry = () =>
  (history.state as Record<string, unknown> | null)?.[GUARD_TAG] === true;

const popStateSlot = () =>
  window as unknown as Record<
    string,
    ((event: PopStateEvent) => void) | undefined
  >;

function pushGuardEntry(url: string): void {
  history.pushState(
    { ...(history.state as object), [GUARD_TAG]: true },
    '',
    url,
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

let recoveredAfterReload = false;

/**
 * Next has no API to block navigation, so this does it from the outside:
 * - Links: a capture listener stops the click before Next's handler sees it.
 * - History: while dirty, a tagged entry sits on top of the page. A capture
 *   listener sees every traversal before Next does. If it left the tagged
 *   entry, Next never hears of it, the page's entry goes back on top, and the
 *   user is asked. This also holds for jumps of several entries at once.
 * - Reload and closing: the browser's own prompt.
 *
 * The guard stays armed until the page really unmounts, so a Discard that could
 * not leave the page keeps protecting it.
 */
export function NavigationGuard() {
  const router = useRouter();
  const pathname = usePathname();
  const dirty = useGuardStore((state) => state.sources > 0);
  const pending = useGuardStore((state) => state.pending);
  const leaving = useRef(false);
  const pushAfterBack = useRef<string | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    leaving.current = false;
    if (settle.current) clearTimeout(settle.current);
  }, [pathname]);

  // A reload can leave the page on its tagged entry: step off it once.
  useEffect(() => {
    if (recoveredAfterReload) return;
    recoveredAfterReload = true;
    if (onGuardEntry() && useGuardStore.getState().sources === 0) {
      history.back();
    }
  }, []);

  useEffect(() => {
    if (!dirty) return;
    const { ask } = useGuardStore.getState();
    const guardedUrl = location.href;
    const guardedPage = location.pathname + location.search;
    if (!onGuardEntry()) pushGuardEntry(guardedUrl);
    const guardedState: unknown = history.state;

    const onClick = (event: MouseEvent) => {
      if (leaving.current) return;
      const href = internalTarget(event);
      if (!href) return;
      event.preventDefault();
      event.stopPropagation();
      ask({ kind: 'push', href });
    };
    const onPopState = (event: PopStateEvent) => {
      if (leaving.current) {
        const href = pushAfterBack.current;
        pushAfterBack.current = null;
        // After Next has handled this traversal.
        if (href) setTimeout(() => router.push(href), 0);
        return;
      }
      // Moving to a fragment creates an entry without state: same page.
      if (event.state === null) return;
      if ((event.state as Record<string, unknown>)[GUARD_TAG] === true) return;

      event.stopImmediatePropagation();
      const samePage = location.pathname + location.search === guardedPage;
      history.pushState(guardedState, '', guardedUrl);
      // On the same page, the entry below ours is the page's own: skip it too.
      ask({ kind: 'back', delta: samePage ? -2 : -1 });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving.current) event.preventDefault();
    };

    document.documentElement.dataset.unsavedChanges = 'true';
    document.addEventListener('click', onClick, true);
    popStateSlot()[GUARD_POPSTATE_HANDLER] = onPopState;
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      delete document.documentElement.dataset.unsavedChanges;
      document.removeEventListener('click', onClick, true);
      popStateSlot()[GUARD_POPSTATE_HANDLER] = undefined;
      window.removeEventListener('beforeunload', onBeforeUnload);
      // Saved, not leaving: drop the tagged entry so Back takes one press.
      if (!leaving.current && onGuardEntry()) history.back();
    };
  }, [dirty, router]);

  function discard() {
    const exit = useGuardStore.getState().pending;
    useGuardStore.getState().close();
    if (!exit) return;
    leaving.current = true;

    if (exit.kind === 'push') {
      if (onGuardEntry()) {
        // Step off the tagged entry first, so the new page replaces it.
        pushAfterBack.current = exit.href;
        history.back();
      } else {
        router.push(exit.href);
      }
      return;
    }

    const url = location.href;
    history.go(exit.delta);
    // With nowhere to go the page stays, edits included, so protect it again.
    settle.current = setTimeout(() => {
      if (location.href !== url) return;
      leaving.current = false;
      if (!onGuardEntry()) pushGuardEntry(url);
    }, BACK_SETTLE_MS);
  }

  return (
    <ConfirmDialog
      open={pending !== null}
      title="Discard changes?"
      description="You have unsaved changes on this page. They will be lost if you leave."
      confirmLabel="Discard"
      cancelLabel="Keep editing"
      onCancel={() => useGuardStore.getState().close()}
      onConfirm={discard}
    />
  );
}
