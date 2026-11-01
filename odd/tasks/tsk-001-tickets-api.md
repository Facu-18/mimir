# TSK-001 — Tickets model and API

Objective: ticket CRUD with atomic per-project numbering, stable `KEY-NNN` codes, filters, archive and duplicate, plus activity events.
Branch: `feat/tsk-001-tickets-api` (stacked on `feat/prj-001-projects-api`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — TSK-001: "CRUD, tipos, estados, prioridades, numeración y validaciones."
- **S2** — Acceptance: "código `KEY-NNN` estable; número único transaccional; CRUD; búsqueda por código; reglas en backend."
- **S3** — Tests: "creación concurrente, actualización, filtros, colisión, datos inválidos."
- **S4** — Plan §4.2 fields: "UUID, número incremental por proyecto, código legible (`SB-001`), título, descripción enriquecida y texto para búsqueda, tipo (`task`, `bug`, `feature`, `improvement`), estado (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`), prioridad, fecha de vencimiento opcional, épica, padre, etiquetas, posición, criterios de aceptación, dependencias y timestamps."
- **S5** — Plan §4.2 rules: "CRUD, duplicar y archivar, con edición inline y detalle lateral." · "IDs legibles inmutables aunque cambie el nombre/clave visible del proyecto." · "Numeración atómica y única por proyecto, incluso con creaciones concurrentes." · "Historial de cambios relevantes mediante eventos de actividad."
- **S6** — Plan §7 routes in scope: "`GET/POST /projects/:projectId/tickets`; `GET/PATCH /tickets/:id`; `POST /tickets/:id/duplicate`; `POST /tickets/:id/archive`".

Out of scope (other tickets): `PUT /tickets/:id/dependencies`, epics, parent/subtasks and labels (TSK-004); `PATCH /tickets/reorder` (TSK-002).

Assumptions (decided here, not in the plan):
- A1: Numbering reserves `project_counters.next_ticket_number` with an atomic `UPDATE … SET n = n + 1` inside the same transaction as the insert; the row lock serializes concurrent creators and a failed insert rolls the reservation back (no gaps from failures).
- A2: The code is `<project key>-<number padded to 3 digits>` (`SB-001`, `SB-1000`). It is stable because project keys are immutable (PRJ-001 A1).
- A3: `GET /tickets/:ref` accepts a UUID or a code (`sb-001` case-insensitive) — this is the "búsqueda por código" / direct access. PATCH, archive, restore and duplicate take the UUID.
- A4: Rules in backend: `completedAt` is set when status becomes `done` and cleared when it leaves `done`; a new ticket, or one whose status changes, goes to the end of its status column (`sortOrder = max + 1`); tickets cannot be created in, or duplicated into, an archived project (409 `Cannot add tickets to an archived project`).
- A5: Acceptance criteria have no column in plan §6; they live in the description for now. Description is `descriptionJson` (rich JSON, nullable) plus `descriptionText` (plain text for search), both sent by the client.
- A6: `GET /projects/:projectId/tickets` filters: `q` (literal case-insensitive match on title or exact code), `status` / `type` / `priority` (comma-separated lists), `archived=exclude|include|only` (default `exclude`), `sort=position|number|createdAt|updatedAt|dueAt|priority` (default `position`) and `order=asc|desc` (default `asc`). Response `{ "items": [...] }`.
- A7: Duplicate copies title, description, type, priority and due date into a new ticket with a new number, status `backlog`, at the end of the column; it is not archived even if the source was.
- A8: Added `POST /tickets/:id/restore` (not in §7) so archiving is reversible, mirroring projects. Archive/restore are idempotent.
- A9: Activity events (same transaction): `ticket.created`, `ticket.updated` (payload `{ changes: { field: { from, to } } }`), `ticket.archived`, `ticket.restored`, `ticket.duplicated` (payload `{ sourceTicketId }`).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S4 | inline | pending | `@mimir/contracts` ticket schemas |
| T2 | S2, S3, S5, S6 | inline | pending | create with atomic numbering, get by id/code, list filters |
| T3 | S1, S5, S6 | inline | pending | patch rules, archive/restore, duplicate, activity events |

Route evidence: sequential units sharing the tickets module; no parallel writer reason; inline.
Risk: item 4 (concurrency — numbering under concurrent creation). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-01, user): "segui" — continuing after PRJ-001 API; next ticket TSK-001.
