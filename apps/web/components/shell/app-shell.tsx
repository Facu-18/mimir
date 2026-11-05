'use client';

import { Reveal } from '@mimir/ui';
import { usePathname } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { NavigationGuard } from '../../features/shell/navigation-guard';
import { useShellStore } from '../../features/shell/shell-store';
import { useShellShortcuts } from '../../features/shell/use-shell-shortcuts';
import { DetailsPanel } from './details-panel';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

/** Lives in the root layout, so it stays mounted across every route. */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useShellShortcuts();

  useEffect(() => {
    useShellStore.getState().hydrate();
    document.documentElement.dataset.shellReady = 'true';
  }, []);

  return (
    <>
      <a
        href="#content"
        className="fixed top-2 left-2 z-50 -translate-y-20 rounded-md bg-accent px-3 py-2 text-sm text-on-accent focus:translate-y-0"
      >
        Skip to content
      </a>
      <div className="flex h-dvh overflow-hidden">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <div className="flex min-h-0 flex-1">
            <main
              id="content"
              tabIndex={-1}
              className="min-w-0 flex-1 overflow-y-auto outline-none"
            >
              <Reveal key={pathname}>{children}</Reveal>
            </main>
            <DetailsPanel />
          </div>
        </div>
      </div>
      <NavigationGuard />
    </>
  );
}
