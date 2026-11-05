import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import {
  MotionProvider,
  THEME_INIT_SCRIPT,
  ThemeSync,
  TooltipProvider,
} from '@mimir/ui';
import { AppShell } from '../components/shell/app-shell';
import { GUARD_INIT_SCRIPT } from '../features/shell/guard-init';
import { SHELL_INIT_SCRIPT } from '../features/shell/shell-store';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Mimir', template: '%s · Mimir' },
  description: 'Your local workspace for projects, documents and ideas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline scripts set the theme and shell state before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: SHELL_INIT_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: GUARD_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-text">
        <ThemeSync />
        <MotionProvider>
          <TooltipProvider>
            <AppShell>{children}</AppShell>
          </TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
