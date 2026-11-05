# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Early implementation: the frontend has its visual system only (`apps/web` — Next.js static export showing a temporary component gallery — and `packages/ui`; UI-001), with no app shell or API calls yet. The backend (`apps/api` — NestJS 12 + Prisma 7 + PostgreSQL in Docker) has the full MVP data model (CORE-002), a default-workspace bootstrap, `/api/v1/health`, and the API for projects (PRJ-001), tickets (TSK-001), epics/labels/subtasks/dependencies (TSK-004), documents (DOC-001), canvases (CAN-002), canvas image assets (CAN-003) and canvas previews and links (CAN-004), plus `packages/contracts` (shared Zod schemas). Feature work is tracked in `odd/tasks/<feature>.md` (specs, assumptions, task evidence). The source of truth for everything else is `mimir-plan-maestro.md` (written in Spanish) — product plan, data model, REST API, and the 21-ticket MVP backlog. Read the relevant sections before working on any ticket.

## Commands

Root (pnpm 12 workspace, Node >= 24):

- `pnpm db:up` / `pnpm db:down` — Postgres 17 container `mimir-postgres`, bound to `127.0.0.1:5433` (5432 is taken by a local Postgres on this machine).
- `pnpm api:dev` — API in watch mode on `http://127.0.0.1:3000/api/v1`.
- `pnpm web:dev` — web app on `http://127.0.0.1:3001`.
- `pnpm build` / `pnpm lint` / `pnpm typecheck` / `pnpm test` — run across all workspace packages.
- `pnpm test:ui` — Playwright browser tests against the static export (`apps/web/e2e`); first run needs `pnpm --filter @mimir/web exec playwright install chromium`. Add `--update-snapshots` only after looking at a visual change; reference screenshots come from Windows.

Inside `apps/api` (copy `.env.example` to `.env` first):

- `pnpm test` — unit tests (Vitest, `src/**/*.spec.ts`). Single file: `pnpm vitest run src/health/health.controller.spec.ts`; single test: add `-t "<name>"`.
- `pnpm test:e2e` — e2e and integration tests (`test/**/*.e2e-spec.ts`, `test/**/*.int-spec.ts`). A global setup drops, recreates and migrates `TEST_DATABASE_URL` (default `mimir_test`) and refuses any DB not ending in `_test`; files run serially. Call `resetDatabase(prisma)` from `test/support/reset-database.ts` in `beforeEach`.
- `pnpm lint` — oxlint (type-aware). Typecheck: `pnpm typecheck` (rebuilds `@mimir/contracts` first; bare `tsc --noEmit` reads a possibly stale `dist`).
- `pnpm db:migrate --name <name>` — create/apply a migration; `pnpm db:deploy` applies pending ones; `pnpm exec prisma generate` regenerates the client.

## Backend conventions (apps/api)

- ESM project (`"type": "module"`, `nodenext`): relative imports must end in `.js`.
- Prisma 7: DB URL lives in `prisma.config.ts` (not the schema); the client is generated into `src/generated/prisma` (git-ignored, regenerated on install/build) and connects through `@prisma/adapter-pg`. `PrismaModule` is global; inject `PrismaService`.
- Request/response contracts are Zod schemas in `packages/contracts` (`@mimir/contracts`, compiled to `dist`; the API's `prebuild`/`pretest`/`pretest:e2e`/`prestart:dev` scripts rebuild it). Validate inputs with `new ZodValidationPipe(schema)` (`src/common`), which answers 400 `{ statusCode, error, message: 'Validation failed', issues: [{ path, message }] }`. Map Prisma rows to contract DTOs (ISO date strings) in a `*.mapper.ts`; use `hasPrismaCode(error, 'P2002' | 'P2025')` to translate to 409/404.
- Feature modules (e.g. `src/projects`) resolve their workspace through `WorkspacesService.getDefault()`; archiving is logical (`status`/`archivedAt`) with no DELETE endpoints — except labels, which are tags and are deleted physically (their ticket links cascade).
- Tickets: every Prisma ticket query must use `TICKET_INCLUDE` (`src/tickets/ticket.mapper.ts`) so `toTicketDto` can build the code, `labelIds`, `dependsOnTicketIds` and `isBlocked`. New tickets (create and duplicate) go through `insertTicket()`, the only path that reserves a number from `project_counters` inside the transaction.
- Ticket concurrency: writes read the row through `lockAndFind()` (`FOR NO KEY UPDATE`); parent/dependency writes first take the per-project advisory lock `lockGraph()`. Always graph lock before row lock to avoid deadlocks. Concurrency tests must be proven by a mutation check (they should fail with the lock removed); a 10-item ring of parallel writes is the pattern that reliably races in-process.
- Search text goes through `escapeLike()` (`src/common`); ticket codes are parsed with `parseTicketCode()` (capped at int4).
- Documents store Tiptap JSON validated by `documentContentSchema` (depth limit, only http(s)/mailto/relative URLs); the server derives `contentText` with `toPlainText` and exports with `toMarkdown` (`src/documents/tiptap.ts`). Saves use optimistic concurrency via `expectedUpdatedAt` (409 with `current`). JSON bodies are capped at 2 MB in `configureApp`.
- Canvases: scenes are persisted only through `CanvasRepository` (`src/canvases`). `PUT /canvases/:id/scene` is a compare-and-swap (conditional `updateMany` on `revision`; 409 with `currentRevision`); never replace it with read-then-write. `canvas_assets` is derived from `scene.files`. JSON under `/canvases` may reach 20 MB; everything else stays at 2 MB.
- Assets: `POST /canvases/:id/assets` (multipart field `file`, 10 MB) accepts PNG, JPEG and WebP, detected from the bytes by `detectImageType`; `GET /assets/:id/content` serves them. Files live under `ASSETS_DIR` (absolute; default `~/.mimir/assets`) and only `AssetStorage` touches that directory; it accepts only the storage keys it generates, so client input never reaches a path. Upload does not link the asset: `canvas_assets` changes only when a saved scene references it. E2e tests run with `ASSETS_DIR` in the system temp folder (`TEST_ASSETS_DIR`).
- Canvas previews are ordinary assets set with `PATCH /canvases/:id { thumbnailAssetId }`. Canvas links live in `entity_links` (`/canvases/:id/links`, targets: project, ticket, document); that table has no foreign keys, so `CanvasLinksService` validates targets, and its unique index rejects duplicates with 409.
- Global prefix and app setup live in `src/configure-app.ts` — e2e tests must call `configureApp(app)` so routes match production.
- Models use `@map`/`@@map` to snake_case tables/columns, UUID ids (`@db.Uuid`), and `Timestamptz` timestamps; deletes are logical (`archivedAt`).
- Rules Prisma cannot express (key format, positive numbers, no self-references) are CHECK constraints appended by hand to the migration SQL: create migrations with `prisma migrate dev --create-only`, edit, then apply. After any schema change, `pnpm exec prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` must print an empty migration. Partial unique indexes use the `partialIndexes` preview (`@@unique([...], where: raw("..."))`).
- Never edit an applied migration: Prisma checksums them. `.gitattributes` forces LF for that reason.
- Database connectivity failures must not crash the API: `DatabaseUnavailableFilter` (global, in `PrismaModule`) maps them to `503 Database unavailable` via `isDatabaseUnavailableError`; other Prisma errors keep Nest's default handling. The default workspace (`DEFAULT_WORKSPACE_ID`) is upserted on bootstrap and lazily by `WorkspacesService.getDefault()`.
- pnpm 12 blocks dependency build scripts; allowed ones are listed under `allowBuilds` in `pnpm-workspace.yaml`. `prisma@latest` currently resolves to an 8.x RC — keep `prisma` and `@prisma/client` pinned to the same stable version.

## Frontend conventions (apps/web, packages/ui)

- Components use semantic tokens from `packages/ui/src/styles/tokens.css` through Tailwind (`bg-surface`, `text-text-muted`), never raw colors. `tokens.spec.ts` checks real contrast there: 4.5:1 for text, 3:1 for control borders and focus, in both themes and over glass. Add new color tokens to both themes.
- Glass (`.glass`) is only for floating surfaces; solid surfaces use `Card`. Animate `transform` and `opacity`, using the `--duration-*` tokens, which drop to zero under reduced motion.
- `packages/ui` is consumed as source (`transpilePackages`). Keep `apps/web` compatible with `output: 'export'`: no SSR, Server Actions or API Routes.
- The theme is applied before first paint by `THEME_INIT_SCRIPT`; keep it in step with `readThemeChoice` and `applyTheme`. `ThemeSync` in the root layout follows system changes on every screen.
- pnpm enforces a minimum release age. If `pnpm add` writes `minimumReleaseAgeExclude` into `pnpm-workspace.yaml`, the version is too new: pick an older one and remove the exclusion instead of committing it.

## What Mimir is

A local-first, single-user personal workspace: projects + tickets (Linear-like), rich documents (Notion-like), and infinite canvases (Excalidraw). Windows first; architecture must stay portable to Linux/macOS/web. AI and MCP integration are explicitly **out of scope for V1** (plan §11–12) — do not add AI providers or "MCP endpoints" yet.

## Planned stack and layout (plan §2, §5)

pnpm workspaces monorepo:

- `apps/web` — Next.js + React + TS with `output: 'export'`. No SSR, Server Actions, or API Routes for core features (it is bundled into Tauri as static files).
- `apps/api` — NestJS REST API under `/api/v1`, Prisma + PostgreSQL (`apps/api/prisma`).
- `apps/desktop/src-tauri` — Tauri 2 shell. Do not assume Tauri ships Node or PostgreSQL; the runtime/installer strategy must be explicit and PostgreSQL may be a documented prerequisite.
- `packages/contracts` (Zod schemas shared by web and api), `packages/domain`, `packages/ui`, `packages/config`.
- `docs/architecture`, `docs/decisions` (ADRs), `docs/api`.

UI: Tailwind + CSS variables + shadcn/ui/Radix, Motion, TanStack Query + Zustand, dnd-kit (Kanban), Tiptap (documents), `@excalidraw/excalidraw` (canvas).

## Architectural rules that span the codebase

- Domain services are independent of HTTP controllers, Tauri, and React. Future adapters (MCP, AI) must call existing services, never duplicate logic.
- Wrap Excalidraw persistence behind an own `CanvasRepository`; never modify Excalidraw internals. Canvas↔entity links live in a separate `entity_links` table.
- IDs are UUIDs, timestamps UTC, deletes are logical (`archived_at`).
- Ticket numbering: atomic per-project reservation via `project_counters`; readable codes (`SB-001`) are immutable even if the project key changes.
- Ticket dependencies must reject self-references and cycles; a parent never auto-completes its children.
- Canvas save is optimistic compare-and-swap: client sends `expectedRevision`, `scene`, `schemaVersion`; backend increments `revision` transactionally and returns `409 Conflict` without overwriting. Scene JSON is schema-versioned; images live as assets in a managed directory, never embedded in the scene or referenced by temp paths.
- Security: API binds to loopback only, restricted CORS, app↔backend session token, validate file size/MIME/paths (no path traversal), no arbitrary shell from the UI.
- Backups = PostgreSQL dump + assets + versioned manifest with checksums; validate and create a recovery point before restoring.

## Working protocol (plan §14)

Per ticket: read the plan, inspect real code/conventions, implement only the ticket's scope, add tests and run lint/typecheck/build, verify migrations when data changes, document deviations (ADRs in `docs/decisions`), and never mark a ticket done without its acceptance criteria verified. Suggested order is in plan §9; first milestone is CORE-001 + CORE-002 + CORE-003 + UI-001.

Project-specific subagents are defined in `.claude/agents/` (backend, frontend, Next.js, NestJS/Node, Postgres, Expo, TypeScript, UI, websocket, code review, debugger).
