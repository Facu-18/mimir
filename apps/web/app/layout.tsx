import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { MotionProvider, THEME_INIT_SCRIPT, TooltipProvider } from '@mimir/ui';
import './globals.css';

export const metadata: Metadata = {
  title: 'Mimir',
  description: 'Your local workspace for projects, documents and ideas.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    // The inline script sets the theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-text">
        <MotionProvider>
          <TooltipProvider>{children}</TooltipProvider>
        </MotionProvider>
      </body>
    </html>
  );
}
