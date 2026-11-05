import { Label as RadixLabel } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export function Label({
  className,
  ...props
}: ComponentProps<typeof RadixLabel.Root>) {
  return (
    <RadixLabel.Root
      className={cn('text-sm font-medium text-text', className)}
      {...props}
    />
  );
}
