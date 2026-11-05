import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '../lib/cn';

const badgeStyles = cva(
  'inline-flex items-center rounded-sm border border-border px-2 py-0.5 text-xs font-medium',
  {
    variants: {
      variant: {
        neutral: 'text-text-muted',
        accent: 'text-accent-text',
        success: 'text-success-text',
        warning: 'text-warning-text',
        danger: 'text-danger-text',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeStyles>;

export function Badge({ variant, className, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeStyles({ variant }), className)} {...props} />
  );
}
