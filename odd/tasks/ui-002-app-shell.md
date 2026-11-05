# UI-002 — AppShell and navigation

Objective: the persistent app frame: sidebar, topbar, routes, detail panel, favorites section, context menus and shortcuts, with protection against losing unsaved changes.
Branch: `feat/ui-002-app-shell` (stacked on `feat/ui-001-design-system`) · Delivery: `ask-on-risk` · Test runners: Playwright (`apps/web`), Vitest (`packages/ui`).

## Specs

- **S1** — UI-002: "sidebar, topbar, rutas, panel lateral, favoritos visuales y context menus."
- **S2** — Acceptance: "navegación fluida; sidebar colapsa; estado activo; ventanas pequeñas; no se pierden cambios."
- **S3** — Tests: "rutas, resize, colapso, back/forward y atajos."
- **S4** — Plan §3.2: "Sidebar colapsable, topbar minimalista y panel de detalle redimensionable." · "Atajos coherentes; foco visible y navegación accesible por teclado." · "Paneles de 180–260 ms; cambio de vista 150–220 ms" · "Menús nativos cuando convenga, tooltips, context menus, drag-and-drop y empty states útiles."
- **S5** — Plan §2: "Next.js debe configurarse con `output: 'export'`" · "TanStack Query + Zustand | Datos remotos/locales y estado de interfaz".
- **S6** — Plan §3.3 screens: "Inicio", "Proyectos", "Tickets", "Documentos", "Ideas / Biblioteca", "Ajustes".

Out of scope: screen contents (their own tickets); the command palette (SRCH-001); calling the API, which has no CORS or session token yet; the Tauri shell (CORE-003).

Assumptions (decided here, not in the plan):
- A1: Routes are `/`, `/projects`, `/tickets`, `/documents`, `/ideas`, `/settings`, each with a useful empty state. `/gallery` keeps the component gallery for browser tests, outside the navigation. `trailingSlash: true`, so every route is a plain `index.html`.
- A2: The favorites section renders its empty state only. Real favorites need the API, so the projects UI connects them.
- A3: Shell state (sidebar collapsed, panel open, panel width) lives in a Zustand store persisted to `localStorage` and applied before first paint, like the theme.
- A4: Below 768 px the sidebar is an icon rail and the collapse control is hidden; the detail panel overlays the content as a glass surface. Otherwise the panel is docked and solid.
- A5: The panel resizes from 280 to 560 px by pointer or by arrow keys on its separator. Its content arrives with TSK-003; for now it shows an empty state.
- A6: Shortcuts: `Ctrl/Cmd+B` sidebar, `Ctrl/Cmd+.` panel, `Alt+1` to `Alt+6` routes. They do nothing while typing in a field, because `Ctrl+B` means bold in the document editor. `Ctrl/Cmd+K` stays reserved for SRCH-001.
- A7: `useUnsavedChanges(dirty)` is how a screen protects its edits. While dirty, internal links, shortcuts and Back ask `Discard changes?` with `Keep editing` and `Discard`; reload and closing use the browser's prompt. Modified clicks (Ctrl, Cmd, Shift) and external links are left alone.
- A8: The sidebar and panel animate `width`, because the content must reflow beside them. The plan says "preferentemente" for `transform` and `opacity`, and the durations still drop to zero under reduced motion.
- A9: Context menus start on navigation items (`Open`, `Collapse sidebar`), through a new `ContextMenu` in `packages/ui`.
- A10: UI copy is English; translation (i18n) comes later, per the user.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1–S6 | inline | done | Browser tests RED 42 → GREEN · commit after the UI-001 language note |
| T2 | S2, S3 | inline | done | Guard tests in the same RED run; 8 mutations of the guard and shortcuts each fail their test · same commit; redesigned after the verifier in the next commit |

Route evidence: sequential units over one shell; no parallel writer reason; inline.
Risk: item 5 (new dependency `zustand`) and item 6 (navigation guard: a regression silently loses user edits). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-05, user): "dejémosla en inglés en un futuro implementamos i18n como traductor vamos con ui-002"
- L2 (2026-11-05): T1–T2 done. Failures fixed on the way: Tailwind utilities beat shell CSS in the `components` layer, so rules moved to `utilities`; axe required a landmark around the brand and favorites; three test mistakes. 
- L3 (2026-11-05): Independent verifier at 9ea1337: S1, S3, S5, S6 pass; 5 blockers. (B1) A Discard that stayed on the page disarmed the guard, and the next edit was lost with no prompt, because `go(-2)` landed on a same-URL entry with protection already cleared. (B2) The skip link or a fragment link while dirty opened the dialog, because fragment moves also fire `popstate`. (B3) Two quick Backs on a busy page, or `history.go(-2)`, lost the draft with no prompt. (B4) Keep editing dropped focus to the body and lost the next keystroke. (B5) Below 768 px the panel controls lost focus, and Escape did not close the panel. One correction batch, redesigning the guard: the guard entry is tagged in `history.state`; a listener registered from `<head>` runs before Next, stops any traversal that leaves the tagged entry and restores it, even across several entries; protection stays until the page unmounts, and a Discard that cannot leave re-arms it; Discard from a link steps off the tagged entry first, which also removes the known limit from L2. `ConfirmDialog` returns focus; the panel moves focus on small windows and closes with Escape. Also from its advisories: only the left button drags, and a lost pointer capture ends the drag. RED: 12 browser tests and 1 unit test. The probe that found the listener order: Next's handler ran first and unmounted the page, removing the guard's listener mid-event. GREEN: ui 47/47, browser 79/79, guard tests repeated 5 times with 110/110. Advisories open: save followed by `router.push` in the same tick bounces back; shortcuts fire behind an open context menu; `Ctrl+B` is ignored with CapsLock and `Ctrl+Alt+B` also toggles; a stored wide panel at 768 px reports a value larger than its real width; below 324 px of height Settings clips; prefetch 404s in the static export (cause not investigated); Chromium's history-manipulation intervention with a real Back button is untested and must be checked in WebView2 (CORE-003).
