import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export type InputProps = ComponentProps<'input'> & { invalid?: boolean };

export function Input({ invalid, className, ...props }: InputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(
        'transition-hover h-10 w-full rounded-md border border-border-strong bg-surface px-3 text-sm text-text',
        'placeholder:text-text-muted disabled:opacity-50',
        'aria-invalid:border-danger-text',
        className,
      )}
      {...props}
    />
  );
}
