'use client';

import { Button } from '@mimir/ui';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useShellStore } from '../../features/shell/shell-store';
import { PANEL_TOGGLE_ID } from './details-panel';

export function Topbar() {
  const sidebarCollapsed = useShellStore((state) => state.sidebarCollapsed);
  const panelOpen = useShellStore((state) => state.panelOpen);
  const toggleSidebar = useShellStore((state) => state.toggleSidebar);
  const togglePanel = useShellStore((state) => state.togglePanel);

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-border px-2">
      <Button
        variant="ghost"
        size="icon"
        className="shell-sidebar-toggle size-9"
        aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!sidebarCollapsed}
        onClick={toggleSidebar}
      >
        <PanelLeft aria-hidden className="size-4" />
      </Button>
      <span />
      <Button
        variant="ghost"
        size="icon"
        id={PANEL_TOGGLE_ID}
        className="shell-panel-toggle size-9"
        aria-label={panelOpen ? 'Close details panel' : 'Open details panel'}
        aria-expanded={panelOpen}
        onClick={togglePanel}
      >
        <PanelRight aria-hidden className="size-4" />
      </Button>
    </header>
  );
}
