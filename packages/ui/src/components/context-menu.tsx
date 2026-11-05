'use client';

import { ContextMenu as RadixContextMenu } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

export const ContextMenu = RadixContextMenu.Root;
export const ContextMenuTrigger = RadixContextMenu.Trigger;

export function ContextMenuContent({
  className,
  ...props
}: ComponentProps<typeof RadixContextMenu.Content>) {
  return (
    <RadixContextMenu.Portal>
      <RadixContextMenu.Content
        className={cn(
          'glass animate-overlay min-w-40 rounded-md p-1 text-sm text-text',
          className,
        )}
        {...props}
      />
    </RadixContextMenu.Portal>
  );
}

export function ContextMenuItem({
  className,
  ...props
}: ComponentProps<typeof RadixContextMenu.Item>) {
  return (
    <RadixContextMenu.Item
      className={cn(
        'cursor-pointer rounded-sm px-2 py-1.5 outline-none',
        'data-[highlighted]:bg-accent data-[highlighted]:text-on-accent',
        className,
      )}
      {...props}
    />
  );
}
