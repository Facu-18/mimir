# PRJ-001 (API) — Projects CRUD

Objective: backend half of PRJ-001 — REST endpoints for projects with shared Zod contracts; the UI half waits for UI-002.
Branch: `feat/prj-001-projects-api` (stacked on `feat/core-002-schema`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — PRJ-001: "crear, listar, editar, favoritos, búsqueda, archivo y restauración con persistencia real."
- **S2** — Acceptance: "claves únicas; validaciones; no duplicados; errores claros; acciones funcionales."
- **S3** — Tests: "CRUD, duplicados de clave, archivos/restauraciones, filtros."
- **S4** — Plan §7 routes: "`GET/POST /projects`; `GET/PATCH /projects/:id`; `POST /projects/:id/archive`; `POST /projects/:id/restore`".
- **S5** — Plan §4.1: "El proyecto tiene UUID, clave corta estable (`SB`), nombre, descripción, icono, color, estado (`active`, `paused`, `completed`, `archived`), favorito, orden y fechas. Permitir alta, edición, favorito, archivo/restauración, búsqueda y acceso a contenido. No eliminar definitivamente por acciones rápidas."
- **S6** — Plan §7: "Contratos compartidos: Zod en `packages/contracts`; formatos uniformes de errores, filtros, paginación y resultados."

Assumptions (decided here, not in the plan):
- A1: The project key is immutable after creation ("clave corta estable"); PATCH rejects `key`. Input keys are trimmed and upper-cased, then must match the DB rule (2–10 uppercase letters/digits, starting with a letter).
- A2: Archive sets `status = archived` and `archivedAt = now`; restore sets `status = active` and clears `archivedAt`. POST/PATCH cannot set `status: archived` — only the archive endpoint can. Archiving an archived project (or restoring an active one) is idempotent and returns 200.
- A3: No DELETE endpoint (S5: no permanent deletion).
- A4: `GET /projects` query: `q` (case-insensitive match on name or key), `status`, `isFavorite`, `archived=exclude|include|only` (default `exclude`). Order: favorites first, then `sortOrder`, then name. Response `{ "items": [...] }`; no pagination yet (single user, few projects).
- A5: Errors use Nest's shape `{ statusCode, error, message }`; validation errors add `issues: [{ path, message }]` (400). Duplicate key → 409 with message `Project key "SB" already exists`. Unknown id → 404 `Project not found`. Non-UUID id → 400.
- A6: All projects belong to the default workspace; creating a project also creates its `project_counters` row in the same transaction (needed by TSK-001).
- A7: Activity events for projects are deferred to PRJ-002 (overview activity).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S6, S2 | inline | done | `@mimir/contracts` schemas (RED missing module → GREEN 15) + ZodValidationPipe (RED → GREEN) · `4f1202c` |
| T2 | S1–S5 | inline | done | projects module; RED 17 failing → GREEN 45/45 e2e; curl smoke on build (201/409/archive/400) · `0f08c83` |

Route evidence: T2 depends on T1, no parallel writer reason; inline.
Risk: item 5 (new dependency `zod` and a new workspace package). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-01, user): "sigamos" — continuing after CORE-002; next backend ticket in plan order is PRJ-001.
- L2 (2026-11-01): T1–T2 done. Checks: contracts 15/15 + tsc; api unit 14/14, e2e 45/45, tsc, oxlint, build green. Branch adds ~940 lines over feat/core-002-schema.
