import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

/** Solid on purpose: glass is only for floating surfaces. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface p-5 text-text',
        className,
      )}
      {...props}
    />
  );
}
