import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const THEME_KEY = 'mimir-theme';
const THEMES = ['light', 'dark'] as const;

const theme = (page: Page) =>
  page.evaluate(() => document.documentElement.dataset.theme);

/** The minifier rewrites 220ms as .22s, so compare in one unit. */
async function durationMs(page: Page, token: string): Promise<number> {
  const value = await page.evaluate(
    (name) =>
      getComputedStyle(document.documentElement).getPropertyValue(name).trim(),
    token,
  );
  const amount = Number.parseFloat(value);
  return value.endsWith('ms') ? amount : Math.round(amount * 1000);
}

function storeTheme(page: Page, value: string) {
  return page.addInitScript(
    ([key, stored]) => localStorage.setItem(key!, stored!),
    [THEME_KEY, value],
  );
}

test.describe('theme', () => {
  test('follows the system by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    expect(await theme(page)).toBe('dark');

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => theme(page)).toBe('light');
  });

  test('keeps the choice after reloading', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');

    await page.getByRole('radio', { name: 'Dark' }).click();
    expect(await theme(page)).toBe('dark');
    await page.reload();

    expect(await theme(page)).toBe('dark');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
  });

  test('applies the stored theme before any bundle runs, so it never flashes', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await storeTheme(page, 'dark');
    await page.route('**/_next/static/**/*.js', (route) => route.abort());

    await page.goto('/');

    expect(await theme(page)).toBe('dark');
    const background = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(background).toBe('rgb(34, 38, 36)');
  });

  test('works without hydration errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(message.text());
    });
    await storeTheme(page, 'dark');

    await page.goto('/');
    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();

    expect(errors).toEqual([]);
  });
});

test.describe('keyboard', () => {
  test('shows a visible focus ring', async ({ page }) => {
    await storeTheme(page, 'dark');
    await page.goto('/');
    await expect(page.getByRole('radio', { name: 'System' })).toBeVisible();

    const button = page.getByRole('button', { name: 'Primary' });
    await button.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    await expect(button).toBeFocused();

    const outline = await button.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        style: style.outlineStyle,
        width: style.outlineWidth,
        color: style.outlineColor,
      };
    });
    expect(outline).toEqual({
      style: 'solid',
      width: '2px',
      color: 'rgb(198, 175, 152)',
    });
  });

  test('changes the theme with the arrow keys', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await storeTheme(page, 'light');
    await page.goto('/');
    await expect(page.getByRole('radio', { name: 'Light' })).toBeChecked();

    await page.getByRole('radio', { name: 'Light' }).focus();
    // A held key, as a person presses it: Radix selects while the arrow is down.
    await page.keyboard.press('ArrowRight', { delay: 50 });

    await expect(page.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(await theme(page)).toBe('dark');

    await page.keyboard.press('ArrowDown', { delay: 50 });
    await expect(page.getByRole('radio', { name: 'System' })).toBeChecked();
  });

  test('opens the dialog, traps focus and returns it on Escape', async ({
    page,
  }) => {
    await page.goto('/');
    const trigger = page.getByRole('button', { name: 'Open dialog' });

    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Rename project' });
    await expect(dialog).toBeVisible();

    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(
        await dialog.evaluate((node) => node.contains(document.activeElement)),
      ).toBe(true);
    }

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('shows the tooltip on focus', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: 'New ticket' }).focus();

    await expect(page.getByRole('tooltip')).toHaveText('New ticket');
  });
});

for (const name of THEMES) {
  test.describe(`${name} theme`, () => {
    test.beforeEach(async ({ page }) => {
      await storeTheme(page, name);
    });

    test('has no accessibility violations, contrast included', async ({
      page,
    }) => {
      await page.goto('/');
      await expect(
        page.getByRole('radio', { name, exact: false }),
      ).toBeChecked();
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });

    test('has no accessibility violations with the dialog open', async ({
      page,
    }) => {
      await page.goto('/');
      await page.getByRole('button', { name: 'Open dialog' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(300);

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });

    test('matches the reference screenshot', async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1024, height: 900 });
      await page.goto('/');
      await page.evaluate(() => document.fonts.ready);

      await expect(page).toHaveScreenshot(`gallery-${name}.png`, {
        fullPage: true,
        maxDiffPixelRatio: 0.01,
      });
    });
  });
}

test.describe('dialog', () => {
  test('rises a few pixels on opening, without sliding across the page', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.getByRole('dialog');

    const { start, end } = await dialog.evaluate((node) => {
      const [animation] = node.getAnimations();
      animation!.pause();
      animation!.currentTime = 0;
      const start = node.getBoundingClientRect();
      animation!.finish();
      const end = node.getBoundingClientRect();
      return {
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
      };
    });

    expect(Math.abs(start.y - end.y)).toBeLessThanOrEqual(16);
    expect(Math.abs(start.x - end.x)).toBeLessThanOrEqual(16);
  });

  test('stays reachable in a very short window', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 200 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const dialog = page.getByRole('dialog');
    await page.waitForTimeout(300);

    const box = await dialog.boundingBox();

    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(200);
  });
});

test.describe('floating surfaces', () => {
  test('use a light blur, while solid surfaces use none', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('heading', { name: 'Buttons' }).locator('..');
    expect(
      await card.evaluate((node) => getComputedStyle(node).backdropFilter),
    ).toBe('none');

    await page.getByRole('button', { name: 'Open dialog' }).click();

    expect(
      await page
        .getByRole('dialog')
        .evaluate((node) => getComputedStyle(node).backdropFilter),
    ).toBe('blur(12px)');
  });
});

test.describe('reduced motion', () => {
  test('still closes a tooltip opened by hovering', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const button = page.getByRole('button', { name: 'New ticket' });

    await button.hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.mouse.move(5, 5, { steps: 5 });

    await expect(page.getByRole('tooltip')).toHaveCount(0);
  });

  test('still closes the dialog', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Open dialog' }).click();

    await page.getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('removes the CSS durations', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const durations = await Promise.all(
      ['--duration-hover', '--duration-view', '--duration-panel'].map((name) =>
        durationMs(page, name),
      ),
    );

    expect(durations).toEqual([0, 0, 0]);
  });

  test('keeps the plan timings otherwise', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');

    expect(await durationMs(page, '--duration-panel')).toBe(220);
  });

  test('opens the dialog with no animation', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    await page.getByRole('button', { name: 'Open dialog' }).click();

    const animation = await page
      .getByRole('dialog')
      .evaluate((node) => getComputedStyle(node).animationName);
    expect(animation).toBe('none');
  });

  test('skips the view entrance movement', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    const heading = page.getByRole('heading', { name: 'Mimir' });
    await expect(heading).toBeVisible();

    const transform = await heading
      .locator('xpath=ancestor::div[contains(@class,"max-w-3xl")]')
      .evaluate((node) => getComputedStyle(node).transform);

    expect(transform).toBe('none');
  });
});
