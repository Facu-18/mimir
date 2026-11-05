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
| T1 | S7, S8 | inline | pending | |
| T2 | S2–S6 | inline | pending | |
| T3 | S1, S2 | inline | pending | |
| T4 | S2, S3 | inline | pending | |

Route evidence: sequential units over one new package; no parallel writer reason; inline.
Risk: item 5 (new frontend dependencies and build tooling). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-05, user): "todo listo en master vamos con UI-001"
