# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Current state

Early implementation: only the backend skeleton exists (`apps/api` — NestJS 12 + Prisma 7 + PostgreSQL in Docker, with a `/api/v1/health` endpoint and a `workspaces` table). The source of truth for everything else is `mimir-plan-maestro.md` (written in Spanish) — product plan, data model, REST API, and the 21-ticket MVP backlog. Read the relevant sections before working on any ticket.

## Commands

Root (pnpm 12 workspace, Node >= 24):

- `pnpm db:up` / `pnpm db:down` — Postgres 17 container `mimir-postgres`, bound to `127.0.0.1:5433` (5432 is taken by a local Postgres on this machine).
- `pnpm api:dev` — API in watch mode on `http://127.0.0.1:3000/api/v1`.
- `pnpm build` / `pnpm lint` / `pnpm test` — run across all workspace packages.

Inside `apps/api` (copy `.env.example` to `.env` first):

- `pnpm test` — unit tests (Vitest, `src/**/*.spec.ts`). Single file: `pnpm vitest run src/health/health.controller.spec.ts`; single test: add `-t "<name>"`.
- `pnpm test:e2e` — e2e tests (`test/**/*.e2e-spec.ts`), hit the real Docker database.
- `pnpm lint` — oxlint (type-aware). Typecheck: `pnpm exec tsc --noEmit`.
- `pnpm db:migrate --name <name>` — create/apply a migration; `pnpm db:deploy` applies pending ones; `pnpm exec prisma generate` regenerates the client.

## Backend conventions (apps/api)

- ESM project (`"type": "module"`, `nodenext`): relative imports must end in `.js`.
- Prisma 7: DB URL lives in `prisma.config.ts` (not the schema); the client is generated into `src/generated/prisma` (git-ignored, regenerated on install/build) and connects through `@prisma/adapter-pg`. `PrismaModule` is global; inject `PrismaService`.
- Global prefix and app setup live in `src/configure-app.ts` — e2e tests must call `configureApp(app)` so routes match production.
- Models use `@map`/`@@map` to snake_case tables/columns, UUID ids (`@db.Uuid`), and `Timestamptz` timestamps.
- pnpm 12 blocks dependency build scripts; allowed ones are listed under `allowBuilds` in `pnpm-workspace.yaml`. `prisma@latest` currently resolves to an 8.x RC — keep `prisma` and `@prisma/client` pinned to the same stable version.

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
