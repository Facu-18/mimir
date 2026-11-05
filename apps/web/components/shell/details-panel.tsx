'use client';

import { Button } from '@mimir/ui';
import { X } from 'lucide-react';
import { useRef, type KeyboardEvent, type PointerEvent } from 'react';
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  useShellStore,
} from '../../features/shell/shell-store';

const KEYBOARD_STEP = 20;

export function DetailsPanel() {
  const panelWidth = useShellStore((state) => state.panelWidth);
  const setPanelWidth = useShellStore((state) => state.setPanelWidth);
  const togglePanel = useShellStore((state) => state.togglePanel);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startX: event.clientX, startWidth: panelWidth };
  }

  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (!drag.current) return;
    // The panel sits on the right, so moving left makes it wider.
    setPanelWidth(
      drag.current.startWidth + drag.current.startX - event.clientX,
    );
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const next = {
      ArrowLeft: panelWidth + KEYBOARD_STEP,
      ArrowRight: panelWidth - KEYBOARD_STEP,
      Home: PANEL_MIN_WIDTH,
      End: PANEL_MAX_WIDTH,
    }[event.key];
    if (next === undefined) return;
    event.preventDefault();
    setPanelWidth(next);
  }

  return (
    <aside aria-label="Details" className="shell-details relative shrink-0">
      <div
        role="separator"
        aria-label="Resize details panel"
        aria-orientation="vertical"
        aria-valuenow={panelWidth}
        aria-valuemin={PANEL_MIN_WIDTH}
        aria-valuemax={PANEL_MAX_WIDTH}
        tabIndex={0}
        className="shell-details-handle absolute inset-y-0 left-0 w-1.5 cursor-col-resize touch-none hover:bg-border-strong"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onKeyDown={onKeyDown}
      />
      <div className="flex h-full flex-col gap-2 overflow-y-auto p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">Details</h2>
          <Button
            variant="ghost"
            size="icon"
            className="shell-details-close size-8"
            aria-label="Close details panel"
            onClick={togglePanel}
          >
            <X aria-hidden className="size-4" />
          </Button>
        </div>
        <p className="text-sm text-text-muted">
          Nothing selected. Pick a ticket to see its details here.
        </p>
      </div>
    </aside>
  );
}
