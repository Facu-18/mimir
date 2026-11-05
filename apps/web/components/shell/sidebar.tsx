'use client';

import {
  cn,
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@mimir/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useGuardedNavigate } from '../../features/shell/navigation-guard';
import { APP_ROUTES, isActiveRoute } from '../../features/shell/routes';
import { useShellStore } from '../../features/shell/shell-store';

export function Sidebar() {
  const pathname = usePathname();
  const navigate = useGuardedNavigate();
  const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useShellStore((state) => state.toggleSidebar);

  return (
    <aside
      aria-label="Sidebar"
      data-testid="sidebar"
      className="shell-sidebar flex shrink-0 flex-col gap-6 overflow-hidden border-r border-border bg-surface p-2"
    >
      <p className="px-2 pt-2 font-semibold">
        <span aria-hidden className="shell-rail-only">
          M
        </span>
        <span className="shell-label">Mimir</span>
      </p>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {APP_ROUTES.map(({ name, href, icon: Icon }) => {
          const active = isActiveRoute(pathname, href);
          return (
            <ContextMenu key={href}>
              <ContextMenuTrigger asChild>
                <Link
                  href={href}
                  aria-label={name}
                  aria-current={active ? 'page' : undefined}
                  title={name}
                  className={cn(
                    'transition-hover flex h-10 items-center gap-3 rounded-md px-3 text-sm whitespace-nowrap',
                    active
                      ? 'bg-accent text-on-accent'
                      : 'text-text-muted hover:bg-surface-raised hover:text-text',
                  )}
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  <span className="shell-label">{name}</span>
                </Link>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onSelect={() => navigate(href)}>
                  Open
                </ContextMenuItem>
                {!sidebarCollapsed && (
                  <ContextMenuItem onSelect={toggleSidebar}>
                    Collapse sidebar
                  </ContextMenuItem>
                )}
              </ContextMenuContent>
            </ContextMenu>
          );
        })}
      </nav>

      <section className="shell-label flex flex-col gap-1 px-3">
        <h2 className="text-xs font-medium whitespace-nowrap text-text-muted">
          Favorites
        </h2>
        <p className="text-xs text-text-muted">
          Star a project to keep it here.
        </p>
      </section>
    </aside>
  );
}
