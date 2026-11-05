import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

const ROUTES = [
  ['Home', '/'],
  ['Projects', '/projects/'],
  ['Tickets', '/tickets/'],
  ['Documents', '/documents/'],
  ['Ideas', '/ideas/'],
  ['Settings', '/settings/'],
] as const;

const SHELL_KEY = 'mimir-shell';

const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const navLink = (page: Page, name: string) =>
  nav(page).getByRole('link', { name, exact: true });
const pathname = (page: Page) => new URL(page.url()).pathname;
const sidebar = (page: Page) => page.getByTestId('sidebar');
const panel = (page: Page) =>
  page.getByRole('complementary', { name: 'Details' });
const separator = (page: Page) =>
  page.getByRole('separator', { name: 'Resize details panel' });
const widthOf = async (locator: ReturnType<Page['getByTestId']>) =>
  (await locator.boundingBox())!.width;

function storeShell(page: Page, value: Record<string, unknown>) {
  return page.addInitScript(
    // Only the first time: this also runs on reload, which must read real state.
    ([key, stored]) => {
      if (!localStorage.getItem(key!)) localStorage.setItem(key!, stored!);
    },
    [SHELL_KEY, JSON.stringify(value)],
  );
}

/** Waits for hydration: shortcuts and guards only work after it. */
async function ready(page: Page, url = '/') {
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute(
    'data-shell-ready',
    'true',
  );
}

test.describe('routes', () => {
  for (const [name, url] of ROUTES) {
    test(`${name} opens directly, marks itself active and has an empty state`, async ({
      page,
    }) => {
      await ready(page, url);

      await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
      await expect(navLink(page, name)).toHaveAttribute('aria-current', 'page');
      await expect(nav(page).locator('[aria-current="page"]')).toHaveCount(1);
      await expect(page.getByRole('main')).toContainText(/\w+/);
    });
  }

  test('navigates by link without reloading the document', async ({ page }) => {
    await ready(page);
    await page.evaluate(() => {
      (window as unknown as { marker: number }).marker = 1;
    });

    await navLink(page, 'Projects').click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );
    expect(pathname(page)).toBe('/projects/');
    expect(
      await page.evaluate(
        () => (window as unknown as { marker?: number }).marker,
      ),
    ).toBe(1);
  });

  test('shows the shell on an unknown route', async ({ page }) => {
    await page.goto('/not-a-route/');

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Page not found',
    );
    await expect(nav(page)).toBeVisible();
  });

  for (const theme of ['light', 'dark']) {
    test(`has no accessibility violations in the ${theme} theme`, async ({
      page,
    }) => {
      await page.addInitScript(
        (value) => localStorage.setItem('mimir-theme', value),
        theme,
      );
      await ready(page);
      await page.getByRole('button', { name: 'Open details panel' }).click();
      await page.waitForTimeout(350);

      const results = await new AxeBuilder({ page }).analyze();

      expect(results.violations).toEqual([]);
    });
  }

  test('offers a skip link to the content', async ({ page }) => {
    await ready(page);

    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Skip to content' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.getByRole('main')).toBeFocused();
  });
});

test.describe('back and forward', () => {
  test('moves through visited routes and keeps the active state', async ({
    page,
  }) => {
    await ready(page);
    await navLink(page, 'Projects').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );
    await navLink(page, 'Ideas').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ideas');

    await page.goBack();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );
    await expect(navLink(page, 'Projects')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.goForward();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ideas');
    await expect(navLink(page, 'Ideas')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

test.describe('sidebar', () => {
  test('collapses to icons, keeps working and restores', async ({ page }) => {
    await ready(page);
    const expanded = await widthOf(sidebar(page));

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();

    await expect.poll(() => widthOf(sidebar(page))).toBeLessThan(expanded / 2);
    await expect(page.getByRole('heading', { name: 'Favorites' })).toBeHidden();
    await navLink(page, 'Projects').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );

    await page.getByRole('button', { name: 'Expand sidebar' }).click();
    await expect.poll(() => widthOf(sidebar(page))).toBe(expanded);
    await expect(
      page.getByRole('heading', { name: 'Favorites' }),
    ).toBeVisible();
  });

  test('stays collapsed across routes and reloads, from the first paint', async ({
    page,
  }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await navLink(page, 'Ideas').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ideas');
    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();

    await page.route('**/_next/static/**/*.js', (route) => route.abort());
    await page.reload();

    expect(await widthOf(sidebar(page))).toBeLessThan(100);
  });

  test('explains the favorites section while it is empty', async ({ page }) => {
    await ready(page);

    await expect(sidebar(page)).toContainText(
      'Star a project to keep it here.',
    );
  });

  test('survives corrupt stored state', async ({ page }) => {
    await page.addInitScript(
      (key) => localStorage.setItem(key, '{not json'),
      SHELL_KEY,
    );
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await ready(page);

    await expect(nav(page)).toBeVisible();
    expect(errors).toEqual([]);
  });
});

test.describe('context menu', () => {
  test('opens a navigation item', async ({ page }) => {
    await ready(page);

    await navLink(page, 'Documents').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Documents',
    );
  });

  test('collapses the sidebar, and closes with Escape', async ({ page }) => {
    await ready(page);

    await navLink(page, 'Documents').click({ button: 'right' });
    await expect(page.getByRole('menu')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu')).toBeHidden();

    await navLink(page, 'Documents').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Collapse sidebar' }).click();

    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
  });

  test('uses a floating glass surface', async ({ page }) => {
    await ready(page);

    await navLink(page, 'Documents').click({ button: 'right' });

    const filter = await page
      .getByRole('menu')
      .evaluate((node) => getComputedStyle(node).backdropFilter);
    expect(filter).toBe('blur(12px)');
  });
});

test.describe('details panel', () => {
  test('opens with an empty state and closes', async ({ page }) => {
    await ready(page);
    await expect(panel(page)).toBeHidden();

    await page.getByRole('button', { name: 'Open details panel' }).click();
    await expect(panel(page)).toContainText('Nothing selected');

    await page.getByRole('button', { name: 'Close details panel' }).click();
    await expect(panel(page)).toBeHidden();
  });

  test('stays solid when docked', async ({ page }) => {
    await ready(page);
    await page.getByRole('button', { name: 'Open details panel' }).click();

    const filter = await panel(page).evaluate(
      (node) => getComputedStyle(node).backdropFilter,
    );
    expect(filter).toBe('none');
  });

  test('resizes with the pointer inside its limits and keeps the width', async ({
    page,
  }) => {
    await storeShell(page, { panelOpen: true, panelWidth: 320 });
    await ready(page);
    const handle = (await separator(page).boundingBox())!;
    const y = handle.y + handle.height / 2;
    const x = handle.x + handle.width / 2;

    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x - 100, y, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await panel(page).boundingBox())!.width)
      .toBe(420);

    await page.mouse.move(x - 100, y);
    await page.mouse.down();
    await page.mouse.move(0, y, { steps: 5 });
    await page.mouse.up();
    await expect
      .poll(async () => (await panel(page).boundingBox())!.width)
      .toBe(560);

    await page.reload();
    await expect
      .poll(async () => (await panel(page).boundingBox())!.width)
      .toBe(560);
  });

  test('resizes with the keyboard and reports its value', async ({ page }) => {
    await storeShell(page, { panelOpen: true, panelWidth: 320 });
    await ready(page);

    await separator(page).focus();
    await page.keyboard.press('ArrowLeft');

    await expect(separator(page)).toHaveAttribute('aria-valuenow', '340');
    await expect
      .poll(async () => (await panel(page).boundingBox())!.width)
      .toBe(340);

    await page.keyboard.press('Home');
    await expect(separator(page)).toHaveAttribute('aria-valuenow', '280');
    await page.keyboard.press('End');
    await expect(separator(page)).toHaveAttribute('aria-valuenow', '560');
  });
});

test.describe('shortcuts', () => {
  test('toggle the sidebar and the panel', async ({ page }) => {
    await ready(page);

    await page.keyboard.press('Control+b');
    await expect(
      page.getByRole('button', { name: 'Expand sidebar' }),
    ).toBeVisible();
    await page.keyboard.press('Control+b');
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();

    await page.keyboard.press('Control+.');
    await expect(panel(page)).toBeVisible();
    await page.keyboard.press('Control+.');
    await expect(panel(page)).toBeHidden();
  });

  test('open each route', async ({ page }) => {
    await ready(page);

    for (const [index, [name]] of ROUTES.entries()) {
      await page.keyboard.press(`Alt+${index + 1}`);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
    }
  });

  test('do nothing while typing in a field', async ({ page }) => {
    await ready(page, '/gallery/');
    await page.getByLabel('Draft').focus();

    await page.keyboard.press('Control+b');
    await page.keyboard.press('Control+.');
    await page.keyboard.press('Alt+2');

    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeVisible();
    await expect(panel(page)).toBeHidden();
    expect(pathname(page)).toBe('/gallery/');
  });
});

test.describe('unsaved changes', () => {
  const discardDialog = (page: Page) =>
    page.getByRole('alertdialog', { name: 'Discard changes?' });

  async function typeDraft(page: Page, text = 'my draft') {
    await ready(page, '/gallery/');
    await page.getByLabel('Draft').fill(text);
    await expect(page.locator('html')).toHaveAttribute(
      'data-unsaved-changes',
      'true',
    );
  }

  test('a clean page navigates without asking', async ({ page }) => {
    await ready(page, '/gallery/');

    await navLink(page, 'Ideas').click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ideas');
    await expect(discardDialog(page)).toBeHidden();
  });

  test('Keep editing stays on the page with the text intact', async ({
    page,
  }) => {
    await typeDraft(page);

    await navLink(page, 'Ideas').click();
    await expect(discardDialog(page)).toBeVisible();
    await page.getByRole('button', { name: 'Keep editing' }).click();

    await expect(discardDialog(page)).toBeHidden();
    expect(pathname(page)).toBe('/gallery/');
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');
  });

  test('Discard goes where the user asked', async ({ page }) => {
    await typeDraft(page);

    await navLink(page, 'Ideas').click();
    await page.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Ideas');
    await expect(discardDialog(page)).toBeHidden();
  });

  test('Escape keeps editing', async ({ page }) => {
    await typeDraft(page);

    await navLink(page, 'Ideas').click();
    await page.keyboard.press('Escape');

    await expect(discardDialog(page)).toBeHidden();
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');
  });

  test('a shortcut asks too', async ({ page }) => {
    await typeDraft(page);
    await page.getByRole('heading', { level: 1 }).click();

    await page.keyboard.press('Alt+2');

    await expect(discardDialog(page)).toBeVisible();
    expect(pathname(page)).toBe('/gallery/');
  });

  test('the context menu asks too', async ({ page }) => {
    await typeDraft(page);

    await navLink(page, 'Ideas').click({ button: 'right' });
    await page.getByRole('menuitem', { name: 'Open' }).click();

    await expect(discardDialog(page)).toBeVisible();
    expect(pathname(page)).toBe('/gallery/');
  });

  test('Back asks, and keeps the text when the user stays', async ({
    page,
  }) => {
    await ready(page, '/settings/');
    await page.getByRole('link', { name: 'Component gallery' }).click();
    await expect(page.getByLabel('Draft')).toBeVisible();
    await page.getByLabel('Draft').fill('my draft');
    await expect(page.locator('html')).toHaveAttribute(
      'data-unsaved-changes',
      'true',
    );

    await page.goBack();

    await expect(discardDialog(page)).toBeVisible();
    expect(pathname(page)).toBe('/gallery/');
    await page.getByRole('button', { name: 'Keep editing' }).click();
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');

    await page.goBack();
    await expect(discardDialog(page)).toBeVisible();
  });

  test('Back then Discard leaves the page in one step', async ({ page }) => {
    await ready(page, '/ideas/');
    await navLink(page, 'Settings').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Settings',
    );
    await page.getByRole('link', { name: 'Component gallery' }).click();
    await expect(page.getByLabel('Draft')).toBeVisible();
    await page.getByLabel('Draft').fill('my draft');
    await expect(page.locator('html')).toHaveAttribute(
      'data-unsaved-changes',
      'true',
    );

    await page.goBack();
    await page.getByRole('button', { name: 'Discard' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Settings',
    );
    await expect(discardDialog(page)).toBeHidden();
  });

  test('saving removes the protection and leaves Back working in one press', async ({
    page,
  }) => {
    await ready(page, '/settings/');
    await page.getByRole('link', { name: 'Component gallery' }).click();
    await expect(page.getByLabel('Draft')).toBeVisible();
    await page.getByLabel('Draft').fill('my draft');
    await expect(page.locator('html')).toHaveAttribute(
      'data-unsaved-changes',
      'true',
    );

    await page.getByRole('button', { name: 'Save draft' }).click();
    await expect(page.locator('html')).not.toHaveAttribute(
      'data-unsaved-changes',
      'true',
    );
    await page.waitForTimeout(100);

    await page.goBack();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Settings',
    );
    await expect(discardDialog(page)).toBeHidden();
  });

  test('reload and closing use the browser prompt only while dirty', async ({
    page,
  }) => {
    const prompts: string[] = [];
    page.on('dialog', async (dialog) => {
      prompts.push(dialog.type());
      await dialog.dismiss();
    });
    await typeDraft(page);
    await page.getByRole('heading', { level: 1 }).click();

    await page.reload({ timeout: 2000 }).catch(() => undefined);

    expect(prompts).toEqual(['beforeunload']);
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');
  });

  test('a modified click is left to the browser', async ({ page, context }) => {
    await typeDraft(page);

    const opened = context.waitForEvent('page');
    await navLink(page, 'Ideas').click({ modifiers: ['Control'] });
    await opened;

    await expect(discardDialog(page)).toBeHidden();
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');
  });

  test('keeps collapsing and the panel available while dirty', async ({
    page,
  }) => {
    await typeDraft(page);

    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await page.getByRole('button', { name: 'Open details panel' }).click();

    await expect(discardDialog(page)).toBeHidden();
    await expect(panel(page)).toBeVisible();
    await expect(page.getByLabel('Draft')).toHaveValue('my draft');
  });
});

test.describe('small windows', () => {
  test.use({ viewport: { width: 360, height: 640 } });

  test('use an icon rail with no horizontal scroll', async ({ page }) => {
    await ready(page);

    expect(await widthOf(sidebar(page))).toBeLessThan(100);
    await expect(
      page.getByRole('button', { name: 'Collapse sidebar' }),
    ).toBeHidden();
    await navLink(page, 'Projects').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );

    const scrolls = await page.evaluate(
      () =>
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
    );
    expect(scrolls).toBe(false);
  });

  test('overlay the details panel on glass, inside the window', async ({
    page,
  }) => {
    await ready(page);

    await page.getByRole('button', { name: 'Open details panel' }).click();

    await expect
      .poll(async () => {
        const box = await panel(page).boundingBox();
        return box!.x + box!.width;
      })
      .toBeLessThanOrEqual(360);
    const filter = await panel(page).evaluate(
      (node) => getComputedStyle(node).backdropFilter,
    );
    expect(filter).toBe('blur(12px)');
    await page.getByRole('button', { name: 'Close details panel' }).click();
    await expect(panel(page)).toBeHidden();
  });

  test('adapt when the window shrinks and grows, keeping the choice', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await ready(page);
    const expanded = await widthOf(sidebar(page));

    await page.setViewportSize({ width: 500, height: 700 });
    await expect.poll(() => widthOf(sidebar(page))).toBeLessThan(100);

    await page.setViewportSize({ width: 1100, height: 700 });
    await expect.poll(() => widthOf(sidebar(page))).toBe(expanded);
  });
});

test.describe('motion', () => {
  test('uses the plan timing, and none under reduced motion', async ({
    page,
  }) => {
    const duration = () =>
      sidebar(page).evaluate(
        (node) => getComputedStyle(node).transitionDuration,
      );

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await ready(page);
    expect(await duration()).toBe('0.22s');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(await duration()).toBe('0s');
  });

  test('animates the view change only without reduced motion', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await ready(page);

    await navLink(page, 'Projects').click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Projects',
    );

    const transform = await page
      .locator('[data-view]')
      .evaluate((node) => getComputedStyle(node).transform);
    expect(transform).toBe('none');
  });
});
