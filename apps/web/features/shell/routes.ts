import {
  FileText,
  FolderKanban,
  Home,
  Lightbulb,
  ListChecks,
  Settings,
  type LucideIcon,
} from 'lucide-react';

export type AppRoute = { name: string; href: string; icon: LucideIcon };

/** In shortcut order: `Alt+1` opens the first one. */
export const APP_ROUTES: AppRoute[] = [
  { name: 'Home', href: '/', icon: Home },
  { name: 'Projects', href: '/projects/', icon: FolderKanban },
  { name: 'Tickets', href: '/tickets/', icon: ListChecks },
  { name: 'Documents', href: '/documents/', icon: FileText },
  { name: 'Ideas', href: '/ideas/', icon: Lightbulb },
  { name: 'Settings', href: '/settings/', icon: Settings },
];

export function isActiveRoute(pathname: string, href: string): boolean {
  const normalize = (path: string) => path.replace(/\/+$/, '') || '/';
  return normalize(pathname) === normalize(href);
}
