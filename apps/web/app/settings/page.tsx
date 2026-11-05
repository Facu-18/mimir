import { Label, ThemeSwitcher } from '@mimir/ui';
import type { Metadata } from 'next';
import Link from 'next/link';
import { EmptyScreen } from '../../components/shell/empty-screen';

export const metadata: Metadata = { title: 'Settings' };

export default function SettingsPage() {
  return (
    <EmptyScreen
      title="Settings"
      message="Motion, storage, export and restore options will appear here."
    >
      <div className="flex items-center gap-3">
        <Label asChild>
          <span>Theme</span>
        </Label>
        <ThemeSwitcher />
      </div>
      <Link href="/gallery/" className="text-sm text-accent-text underline">
        Component gallery
      </Link>
    </EmptyScreen>
  );
}
