import { invoke, isTauri } from '@tauri-apps/api/core';

/** What the desktop shell reports about the local API it runs. */
export type BackendStatus =
  | { kind: 'starting' }
  | { kind: 'ready'; port: number; token: string }
  | { kind: 'needsDatabase'; message: string | null }
  | { kind: 'failed'; message: string };

/** True inside the desktop app; false in a plain browser (`pnpm web:dev`). */
export const isDesktop = (): boolean => isTauri();

export const backend = {
  status: () => invoke<BackendStatus>('backend_status'),
  /** Rejects with the shell's message when the URL is not valid. */
  saveDatabaseUrl: (url: string) => invoke<void>('save_database_url', { url }),
  retry: () => invoke<void>('retry_backend'),
  /** The window opens hidden, so the first paint already has its theme. */
  showWindow: () => invoke<void>('app_ready'),
};
