import { create } from 'zustand';

export const SHELL_STORAGE_KEY = 'mimir-shell';
export const PANEL_MIN_WIDTH = 280;
export const PANEL_MAX_WIDTH = 560;
export const PANEL_DEFAULT_WIDTH = 320;

type ShellPreferences = {
  sidebarCollapsed: boolean;
  panelOpen: boolean;
  panelWidth: number;
};

type ShellStore = ShellPreferences & {
  hydrate: () => void;
  toggleSidebar: () => void;
  togglePanel: () => void;
  setPanelWidth: (width: number) => void;
};

/**
 * Runs from an inline script in `<head>`, so a collapsed sidebar or open panel
 * is right from the first paint. It cannot import anything, so it repeats
 * `readPreferences` and `applyToDocument` in plain JavaScript.
 */
export const SHELL_INIT_SCRIPT = `(function () {
  var stored = {};
  try {
    stored = JSON.parse(localStorage.getItem(${JSON.stringify(SHELL_STORAGE_KEY)})) || {};
  } catch (e) {}
  var root = document.documentElement;
  if (stored.sidebarCollapsed === true) root.dataset.sidebar = 'collapsed';
  if (stored.panelOpen === true) root.dataset.panel = 'open';
  if (typeof stored.panelWidth === 'number' && isFinite(stored.panelWidth)) {
    var width = Math.min(${PANEL_MAX_WIDTH}, Math.max(${PANEL_MIN_WIDTH}, Math.round(stored.panelWidth)));
    root.style.setProperty('--panel-width', width + 'px');
  }
})();`;

export function clampPanelWidth(width: number): number {
  return Math.min(
    PANEL_MAX_WIDTH,
    Math.max(PANEL_MIN_WIDTH, Math.round(width)),
  );
}

function readPreferences(): ShellPreferences {
  let stored: Partial<ShellPreferences> | null = null;
  try {
    stored = JSON.parse(
      localStorage.getItem(SHELL_STORAGE_KEY) ?? 'null',
    ) as Partial<ShellPreferences> | null;
  } catch {
    // Blocked or corrupt storage: start from the defaults.
  }
  const width = stored?.panelWidth;
  return {
    sidebarCollapsed: stored?.sidebarCollapsed === true,
    panelOpen: stored?.panelOpen === true,
    panelWidth:
      typeof width === 'number' && Number.isFinite(width)
        ? clampPanelWidth(width)
        : PANEL_DEFAULT_WIDTH,
  };
}

function applyToDocument(preferences: ShellPreferences): void {
  const root = document.documentElement;
  if (preferences.sidebarCollapsed) root.dataset.sidebar = 'collapsed';
  else delete root.dataset.sidebar;
  if (preferences.panelOpen) root.dataset.panel = 'open';
  else delete root.dataset.panel;
  root.style.setProperty('--panel-width', `${preferences.panelWidth}px`);
}

function save(preferences: ShellPreferences): void {
  applyToDocument(preferences);
  try {
    localStorage.setItem(SHELL_STORAGE_KEY, JSON.stringify(preferences));
  } catch {
    // Blocked storage: the change applies until the next reload.
  }
}

const preferencesOf = ({
  sidebarCollapsed,
  panelOpen,
  panelWidth,
}: ShellPreferences): ShellPreferences => ({
  sidebarCollapsed,
  panelOpen,
  panelWidth,
});

/** CSS draws the shell from the `<html>` attributes this store keeps in step. */
export const useShellStore = create<ShellStore>((set, get) => {
  const update = (change: Partial<ShellPreferences>) => {
    set(change);
    save(preferencesOf(get()));
  };
  return {
    sidebarCollapsed: false,
    panelOpen: false,
    panelWidth: PANEL_DEFAULT_WIDTH,
    hydrate: () => {
      const preferences = readPreferences();
      set(preferences);
      applyToDocument(preferences);
    },
    toggleSidebar: () => update({ sidebarCollapsed: !get().sidebarCollapsed }),
    togglePanel: () => update({ panelOpen: !get().panelOpen }),
    setPanelWidth: (width) => update({ panelWidth: clampPanelWidth(width) }),
  };
});
