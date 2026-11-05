import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

type Status =
  | { kind: 'starting' }
  | { kind: 'ready'; port: number; token: string }
  | { kind: 'needsDatabase'; message: string | null }
  | { kind: 'failed'; message: string };

type Call = { cmd: string; args: Record<string, unknown> };

const TOKEN = 'f'.repeat(64);
const READY: Status = { kind: 'ready', port: 4242, token: TOKEN };
const URL_OK = 'postgresql://mimir:s3cret@localhost:5432/mimir';

/**
 * Stands in for the Tauri shell: `window.__desktop.status` is what the shell
 * reports, and every command the page sends lands in `window.__desktop.calls`.
 */
async function desktop(page: Page, status: Status) {
  await page.addInitScript((initial) => {
    const state = {
      status: initial,
      calls: [] as Call[],
      saveError: null as string | null,
      broken: false,
    };
    Object.assign(window, {
      __desktop: state,
      isTauri: true,
      __TAURI_INTERNALS__: {
        invoke: async (cmd: string, args: Record<string, unknown> = {}) => {
          state.calls.push({ cmd, args });
          if (state.broken) throw new Error('shell gone');
          if (cmd === 'backend_status') return state.status;
          if (cmd === 'save_database_url') {
            if (state.saveError) throw state.saveError;
            state.status = { kind: 'starting' };
          }
          if (cmd === 'retry_backend') state.status = { kind: 'starting' };
          return null;
        },
        transformCallback: () => 0,
      },
    });
  }, status);
}

const setStatus = (page: Page, status: Status) =>
  page.evaluate((next) => {
    (window as unknown as { __desktop: { status: Status } }).__desktop.status =
      next;
  }, status);

const calls = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __desktop: { calls: Call[] } }).__desktop.calls,
  );

const commands = async (page: Page, cmd: string) =>
  (await calls(page)).filter((call) => call.cmd === cmd);

/** Next keeps an empty route announcer with the same role on every page. */
const alert = (page: Page) =>
  page.locator('[role="alert"]:not(#__next-route-announcer__)');
const nav = (page: Page) => page.getByRole('navigation', { name: 'Main' });
const urlField = (page: Page) =>
  page.getByLabel('Connection URL', { exact: true });

test('in a browser there is no gate and no shell call', async ({ page }) => {
  await page.goto('/');
  await expect(nav(page)).toBeVisible();
  await expect(page.getByText('Starting Mimir')).toHaveCount(0);
  expect(
    await page.evaluate(() => 'isTauri' in window || '__desktop' in window),
  ).toBe(false);
});

test('waits for the local API, then shows the app', async ({ page }) => {
  await desktop(page, { kind: 'starting' });
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText(/Starting Mimir/);
  await expect(nav(page)).toHaveCount(0);

  await setStatus(page, READY);
  await expect(nav(page)).toBeVisible();
  await expect(page.getByRole('status')).toHaveCount(0);
  expect(await commands(page, 'app_ready')).toHaveLength(1);
});

test('shows the window once, even across several status changes', async ({
  page,
}) => {
  await desktop(page, { kind: 'needsDatabase', message: null });
  await page.goto('/');
  await expect(urlField(page)).toBeVisible();
  await setStatus(page, { kind: 'starting' });
  await expect(page.getByRole('status')).toBeVisible();
  await setStatus(page, READY);
  await expect(nav(page)).toBeVisible();
  expect(await commands(page, 'app_ready')).toHaveLength(1);
});

test('never puts the session token in the page', async ({ page }) => {
  await desktop(page, READY);
  await page.goto('/');
  await expect(nav(page)).toBeVisible();
  expect(await page.content()).not.toContain(TOKEN);
});

test.describe('database screen', () => {
  test('asks for the connection and states that PostgreSQL is required', async ({
    page,
  }) => {
    await desktop(page, { kind: 'needsDatabase', message: null });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Connect to PostgreSQL' }),
    ).toBeVisible();
    await expect(page.getByText(/Mimir needs PostgreSQL/)).toBeVisible();
    await expect(urlField(page)).toBeFocused();
    await expect(alert(page)).toHaveCount(0);
  });

  test('saves the URL, then starts with it', async ({ page }) => {
    await desktop(page, { kind: 'needsDatabase', message: null });
    await page.goto('/');
    await urlField(page).fill(`  ${URL_OK}  `);
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(page.getByRole('status')).toHaveText(/Starting Mimir/);
    expect(await commands(page, 'save_database_url')).toEqual([
      { cmd: 'save_database_url', args: { url: URL_OK } },
    ]);
    await setStatus(page, READY);
    await expect(nav(page)).toBeVisible();
    expect(await page.content()).not.toContain('s3cret');
  });

  test('shows why the shell refused a URL and keeps what was typed', async ({
    page,
  }) => {
    await desktop(page, { kind: 'needsDatabase', message: null });
    await page.goto('/');
    await page.evaluate(() => {
      (
        window as unknown as { __desktop: { saveError: string } }
      ).__desktop.saveError = 'Enter a URL like postgresql://user:password@localhost:5432/mimir';
    });
    await urlField(page).fill('mysql://nope');
    await page.getByRole('button', { name: 'Connect' }).click();

    await expect(alert(page)).toHaveText(
      'Enter a URL like postgresql://user:password@localhost:5432/mimir',
    );
    await expect(urlField(page)).toHaveValue('mysql://nope');
    await expect(urlField(page)).toHaveAttribute('aria-invalid', 'true');
    await expect(urlField(page)).toBeFocused();
  });

  test('does not send an empty URL', async ({ page }) => {
    await desktop(page, { kind: 'needsDatabase', message: null });
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect' }).click();
    expect(await commands(page, 'save_database_url')).toHaveLength(0);
  });

  test('explains a connection the server refused', async ({ page }) => {
    await desktop(page, {
      kind: 'needsDatabase',
      message: "P1001: Can't reach database server at `localhost:5432`",
    });
    await page.goto('/');
    await expect(alert(page)).toContainText(
      "Can't reach database server",
    );
  });
});

test.describe('startup failure', () => {
  test('shows the reason and retries', async ({ page }) => {
    await desktop(page, {
      kind: 'failed',
      message: 'Starting the local API took too long.',
    });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: 'Mimir could not start' }),
    ).toBeVisible();
    await expect(alert(page)).toHaveText(
      'Starting the local API took too long.',
    );
    await page.getByRole('button', { name: 'Try again' }).click();
    await expect(page.getByRole('status')).toHaveText(/Starting Mimir/);
    expect(await commands(page, 'retry_backend')).toHaveLength(1);
  });

  test('lets the user change the connection', async ({ page }) => {
    await desktop(page, { kind: 'failed', message: 'P3009: failed migrations' });
    await page.goto('/');
    await page
      .getByRole('button', { name: 'Change database connection' })
      .click();
    await expect(urlField(page)).toBeFocused();
  });

  test('reports a shell that stopped answering', async ({ page }) => {
    await desktop(page, { kind: 'starting' });
    await page.goto('/');
    await page.evaluate(() => {
      (window as unknown as { __desktop: { broken: boolean } }).__desktop.broken =
        true;
    });
    await expect(
      page.getByRole('heading', { name: 'Mimir could not start' }),
    ).toBeVisible();
    await expect(alert(page)).toHaveText(
      'The desktop app did not answer.',
    );
  });
});

test.describe('when the API stops later', () => {
  test('keeps the page and its edits, and offers a retry', async ({ page }) => {
    await desktop(page, READY);
    await page.goto('/settings/');
    await expect(nav(page)).toBeVisible();
    // The first status arrives after the static render, which it replaces.
    await expect
      .poll(async () => (await commands(page, 'app_ready')).length)
      .toBe(1);
    // No screen has fields yet. A remounted page would lose this marker,
    // exactly as it would lose a draft.
    await page.getByRole('main').evaluate((main) => {
      main.dataset.probe = 'kept';
    });

    await setStatus(page, {
      kind: 'failed',
      message: 'The local API stopped.',
    });
    const banner = alert(page);
    await expect(banner).toContainText('The local API stopped.');
    await expect(nav(page)).toBeVisible();
    await expect(page.getByRole('main')).toHaveAttribute('data-probe', 'kept');

    await banner.getByRole('button', { name: 'Try again' }).click();
    expect(await commands(page, 'retry_backend')).toHaveLength(1);
    await setStatus(page, READY);
    await expect(alert(page)).toHaveCount(0);
    await expect(nav(page)).toBeVisible();
  });
});

test.describe('accessibility', () => {
  for (const status of [
    { kind: 'starting' },
    { kind: 'needsDatabase', message: 'P1000: Authentication failed' },
    { kind: 'failed', message: 'The local API stopped.' },
  ] as Status[]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      test(`${status.kind} screen in ${colorScheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await desktop(page, status);
        await page.goto('/');
        await expect(page.locator('[data-desktop-gate]')).toBeVisible();
        const results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);
      });
    }
  }
});
