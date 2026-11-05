'use client';

import { Button } from '@mimir/ui';
import { X } from 'lucide-react';
import {
  useEffect,
  useRef,
  type KeyboardEvent,
  type PointerEvent,
} from 'react';
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  useShellStore,
} from '../../features/shell/shell-store';

const KEYBOARD_STEP = 20;
const OVERLAY_QUERY = '(max-width: 767px)';
export const PANEL_TOGGLE_ID = 'details-panel-toggle';

export function DetailsPanel() {
  const panelWidth = useShellStore((state) => state.panelWidth);
  const setPanelWidth = useShellStore((state) => state.setPanelWidth);
  const togglePanel = useShellStore((state) => state.togglePanel);
  const panelOpen = useShellStore((state) => state.panelOpen);
  const panelToggles = useShellStore((state) => state.panelToggles);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  // Below the breakpoint each control hides the other, so the keyboard must
  // move with the panel. A docked panel leaves the toggle where it is.
  useEffect(() => {
    if (panelToggles === 0 || !matchMedia(OVERLAY_QUERY).matches) return;
    if (panelOpen) closeButton.current?.focus();
    else document.getElementById(PANEL_TOGGLE_ID)?.focus();
    // Only when the user toggles, never on other state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [panelToggles]);

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape' && matchMedia(OVERLAY_QUERY).matches) {
      togglePanel();
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
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
    // Escape from anywhere inside closes the floating panel.
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <aside
      aria-label="Details"
      className="shell-details relative shrink-0"
      onKeyDown={onPanelKeyDown}
    >
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
        onLostPointerCapture={() => {
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
            ref={closeButton}
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
