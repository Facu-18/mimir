import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const buttonStyles = cva(
  [
    'transition-hover inline-flex cursor-pointer items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap',
    'disabled:pointer-events-none disabled:opacity-50',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent-hover',
        secondary:
          'border border-border-strong bg-surface text-text hover:bg-surface-raised',
        ghost: 'text-text hover:bg-surface-raised',
        danger: 'bg-danger text-on-danger hover:bg-danger-hover',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4 text-sm',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonStyles> & { asChild?: boolean };

export function Button({
  variant,
  size,
  asChild = false,
  className,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot.Root : 'button';
  return (
    <Component
      // A plain button must not submit a surrounding form by accident.
      type={asChild ? undefined : 'button'}
      className={cn(buttonStyles({ variant, size }), className)}
      {...props}
    />
  );
}
