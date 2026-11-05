import { Card } from '@mimir/ui';
import type { ReactNode } from 'react';

/** A screen whose content arrives with a later ticket. */
export function EmptyScreen({
  title,
  message,
  children,
}: {
  title: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6 sm:p-10">
      <h1 className="text-2xl font-semibold">{title}</h1>
      <Card className="flex flex-col items-start gap-4">
        <p className="text-sm text-text-muted">{message}</p>
        {children}
      </Card>
    </div>
  );
}
