# CORE-002 — PostgreSQL + Prisma + migrations

Objective: full MVP data model (plan §6) as versioned Prisma migrations, default workspace bootstrap, isolated test DB and handled connection errors.
Branch: `feat/core-002-schema` · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`).

## Specs

- **S1** — "conexión PostgreSQL, esquema inicial, migraciones versionadas, seed de workspace, repositorios base."
- **S2** — Data model from plan §6: tables `workspaces`, `projects`, `project_counters`, `epics`, `tickets`, `ticket_dependencies`, `labels`, `ticket_labels`, `documents`, `canvases`, `assets`, `canvas_assets`, `entity_links`, `activity_events`, `app_settings`. "Todos los IDs internos son UUID; timestamps en UTC; borrados preferentemente lógicos. Índices en filtros habituales, `project_id`, `created_at`, `status`, y texto de búsqueda." Constraints: projects "Clave por workspace única"; tickets "Único `(project_id,number)`"; ticket_dependencies "Par único, sin ciclos".
- **S3** — Acceptance: "migración en BD vacía y existente; datos persistentes; errores de conexión gestionados; fixtures aislados de producción."
- **S4** — Tests: "migración/rollback en test, integridad referencial, CRUD y fallo de conexión."

Assumptions (not in the plan, decided here):
- A1: Ticket priority values `none|low|medium|high|urgent`; epic status `planned|in_progress|done|canceled`.
- A2: Cycle detection for dependencies is application logic (TSK-004); the DB only rejects self-references (CHECK) and duplicate pairs.
- A3: Prisma has no down migrations. "rollback" is covered by: a failed transaction leaves no partial rows, and the test DB can be reset and fully re-migrated.
- A4: "seed de workspace" = idempotent bootstrap of a default workspace with a fixed UUID at API startup, so installs need no separate seed step.
- A5: "repositorios base" = the shared `PrismaService` plus per-module data access added by each feature ticket; no generic repository layer.
- A6: Full-text search indexes (tsvector/GIN) are deferred to SRCH-001; this ticket adds B-tree indexes on filter columns.
- A7: When the database is unreachable the API still starts, logs the outage and answers `503 {"statusCode":503,"error":"Service Unavailable","message":"Database unavailable"}` (health: `503 {"status":"error","database":"down"}`), so the desktop shell can report it instead of crashing.
- A8: Project keys must be 2–10 characters, uppercase letters or digits, starting with a letter (plan example: `SB`).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S3, S4 | inline | done | isolated `mimir_test` DB; RED: tests ran on dev DB → GREEN · `eaa6753` |
| T2 | S1, S2, S4 | inline | done | schema + migration + CHECKs + partial unique; RED 18 failing → GREEN 21; drift empty · `bde5720`, LF fix `eec8854` |
| T3 | S1, S3 | inline | done | idempotent default workspace; RED missing module → GREEN · `8324672` |
| T4 | S3, S4 | inline | done | 503 filter + non-fatal startup; real outage smoke found ECONNREFUSED gap → RED → GREEN · `935da0b` |

Route evidence: all units are sequential and depend on T1/T2, so there is no parallel writer reason; inline.
Risk: item 1 (new migration / persisted schema). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-10-30, user): "perfecto vamos con el esquem core002"
- L2 (2026-10-30): T1–T4 done. Checks: unit 12/12, integration+e2e 26/26, tsc, oxlint, build green. Migration applied to empty (mimir_test) and existing (mimir) DBs; `prisma migrate diff` DB→schema is empty.
- L3 (2026-10-30): Real smoke with the container stopped crashed startup: pg errno `ECONNREFUSED` surfaces as the Prisma error code without driverAdapterError meta. Added errno codes to detection with tests; smoke then gave 503 down → 200 after restart.
- L4 (2026-10-30): Added `.gitattributes` (LF) because Prisma checksums migration files and core.autocrlf=true would alter them on checkout.
- L5 (2026-10-30): Branch is ~1.4k changed lines (≈320 generated migration SQL) over the ~400 budget; delivery strategy question deferred until a PR is requested.
