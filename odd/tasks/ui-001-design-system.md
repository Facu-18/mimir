# UI-001 — Global visual system

Objective: create `apps/web` (the frontend half of CORE-001, still missing) and `packages/ui`, with semantic tokens, typography, base components, accessibility, light/dark themes and motion.
Branch: `feat/ui-001-design-system` (from `master`) · Delivery: `ask-on-risk` · Test runners: Vitest and Testing Library (`packages/ui`), Playwright (`apps/web`).

## Specs

- **S1** — UI-001: "tokens, tipografía, componentes base, accesibilidad, light/dark y Motion."
- **S2** — Acceptance: "estilos consistentes, contraste legible, focus visible, reduced motion, sin blur excesivo."
- **S3** — Tests: "snapshots/capturas, teclado, contraste, tema y animaciones reducidas."
- **S4** — Plan §3: "*Lo-fi Native Glass*: sobria, tranquila y cálida; glassmorphism ligero sin blurs excesivos ni brillos molestos." · "Los colores deben exponerse como variables CSS semánticas con versiones light/dark, y comprobar contraste real."
- **S5** — Plan §3.1 tokens: "Fondo oscuro `#222624`", "Superficie oscura `#343C36`", "Verde salvia `#81917E`", "Arena cálida `#C6AF98`", "Texto claro `#E8DFD2`".
- **S6** — Plan §3.2: "Paneles de 180–260 ms; cambio de vista 150–220 ms; hover 100–160 ms, como objetivos iniciales." · "Animar preferentemente `transform` y `opacity`; respetar `prefers-reduced-motion`." · "Glass aplicado solo a superficies flotantes; nunca sacrificar claridad visual o performance."
- **S7** — Plan §2: "Next.js debe configurarse con `output: 'export'` y no depender de SSR, Server Actions ni API Routes para las funciones centrales." · UI stack: "Tailwind CSS + CSS variables + shadcn/ui/Radix", "Motion + CSS".
- **S8** — CORE-001 acceptance, frontend half: "frontend y API arrancan; build/typecheck/lint funcionan desde raíz".

Out of scope: AppShell, navigation and routes (UI-002); persisting preferences in the backend (SYS-001); `packages/domain`, `packages/config` and the root README (nothing needs them yet); calling the API.

Assumptions (decided here, not in the plan):
- A1: Components live in `packages/ui` and are consumed as source through `transpilePackages`, so there is no separate build step.
- A2: The theme is `light`, `dark` or `system`, stored in `localStorage` until SYS-001. An inline script in `<head>` applies it before first paint, so there is no flash.
- A3: Contrast targets: 4.5:1 for text, 3:1 for control borders and the focus ring, in both themes, including over glass. Tests read the real values from `tokens.css`, and axe runs against the rendered page.
- A4: Glass blur is at most 12 px and only on floating surfaces (dialogs, tooltips).
- A5: Fonts ship with the app (Inter and JetBrains Mono through Fontsource), because it must work offline.
- A6: `/` shows a temporary component gallery, used by the browser tests, until UI-002 replaces it.
- A7: Components start with this set: Button, Input, Label, Badge, Card, Dialog, Tooltip, ThemeSwitcher, Reveal. Others come with the ticket that needs them.
- A8: UI copy is English for now, following the project's artifact default.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S7, S8 | inline | done | Static build, dev server answers 200, root build, typecheck and lint · `99b6efb` |
| T2 | S2–S6 | inline | done | Specs failed first, then green; contrast and blur mutations fail · `99b6efb`, theme sync in the next commit |
| T3 | S1, S2 | inline | done | Specs failed first, then green · `99b6efb` |
| T4 | S2, S3 | inline | done | 19 browser tests; focus, axe contrast, reduced motion, init script and theme sync mutations fail · `2061ac7` |

Route evidence: sequential units over one new package; no parallel writer reason; inline.
Risk: item 5 (new frontend dependencies and build tooling). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-05, user): "todo listo en master vamos con UI-001"
- L2 (2026-11-05): `pnpm add` wrote `minimumReleaseAgeExclude` for `lucide-react@1.69.0` and `jsdom@31.0.0`, which were hours old. Not accepted: pinned `lucide-react@1.66.0` and `jsdom@30.1.3`, removed the exclusions and rebuilt the lockfile from master's; `pnpm install --frozen-lockfile` passes.
- L3 (2026-11-05): Process slip, the same as CAN-002 L2: `99b6efb` and `2061ac7` were committed while one browser test had failed, because that command did not stop on failure. The failure was a real defect, not noise: the system theme listener lived in `ThemeSwitcher`, so a change during hydration was lost and any screen without a switcher would stop following the system. Fixed with `ThemeSync` in the root layout (RED, then 43/43 unit; the browser test passes 15/15 repeated). Commits now run behind a chain that stops on any failure.
- L4 (2026-11-05): One restore during the mutation run failed with `Permission denied`, which could have contaminated the next mutation. Checked that nothing stayed mutated and repeated that mutation alone; axe reports `color-contrast`.
- L5 (2026-11-05): Independent verifier at 15beca1: S5, S7 and S8 pass; 3 blockers. (B1) Under reduced motion a tooltip opened by hover never closed, because Radix waits for an animation end that a 0 s animation does not report. (B2) The dialog slid about 220 px on opening, because the keyframe repeated the centering already set through the `translate` property. (B3) Control borders reached only 2.87:1 on a dialog in the light theme, because the contrast test left out the overlay. The 19 browser tests missed all three: most ran without animation or only read computed styles. One correction batch: `animation: none` under reduced motion, a keyframe with only the offset, an `--overlay` token included in the contrast test, and a darker `--border-strong`. RED: all three reproduced, and restoring the old border fails with 2.87. Also from its advisories: Up and Down arrows in the theme group, a height limit on the dialog, and corrected storage comments. GREEN: contracts 95/95, ui 43/43, api unit 39/39, browser 23/23, lint with 0 warnings, typecheck, build. Advisories open: in a second tab the theme goes stale until reload; with blocked storage a system change overrides the choice; the page is blank without JavaScript; the Tauri window background must match the theme (CORE-003); a clean install needs `apps/api/.env` (also at master).
- L6 (2026-11-05): Recheck at 6c73dae in a clean clone, blockers only: B1 FIXED (tooltip gone within 2 ms; the previous commit still showed it after 5 s), B2 FIXED (first frame 8 px from its final center, ends centered), B3 FIXED (input border 3.47:1 light and 4.56:1 dark on the dialog; lowest dialog text 5.03:1). Nothing broken by the fixes; browser tests 23/23. Next: the user decides the UI language (A8).
