'use client';

import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { RadioGroup } from 'radix-ui';
import { useEffect, useState } from 'react';
import { cn } from '../lib/cn';
import {
  applyTheme,
  onSystemThemeChange,
  readThemeChoice,
  storeThemeChoice,
  type ThemeChoice,
} from './theme';

const OPTIONS: { value: ThemeChoice; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeSwitcher({ className }: { className?: string }) {
  // Starts on system so the server-rendered HTML matches the first client render.
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    setChoice(readThemeChoice());
  }, []);

  useEffect(() => {
    if (choice !== 'system') return;
    return onSystemThemeChange(() => applyTheme('system'));
  }, [choice]);

  function select(value: string) {
    const next = value as ThemeChoice;
    setChoice(next);
    storeThemeChoice(next);
    applyTheme(next);
  }

  return (
    <RadioGroup.Root
      aria-label="Theme"
      orientation="horizontal"
      value={choice}
      onValueChange={select}
      className={cn(
        'inline-flex gap-1 rounded-md border border-border bg-surface p-1',
        className,
      )}
    >
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <RadioGroup.Item
          key={value}
          value={value}
          aria-label={label}
          className={cn(
            'transition-hover inline-flex size-8 cursor-pointer items-center justify-center rounded-sm text-text-muted',
            'hover:bg-surface-raised hover:text-text',
            'data-[state=checked]:bg-accent data-[state=checked]:text-on-accent',
          )}
        >
          <Icon aria-hidden className="size-4" />
        </RadioGroup.Item>
      ))}
    </RadioGroup.Root>
  );
}
