# TSK-004 — Epics, subtasks, labels and dependencies (API)

Objective: ticket hierarchies and relations with graph validation: epics, parent/subtasks, labels and dependencies without cycles, plus visible blocking.
Branch: `feat/tsk-004-ticket-relations` (stacked on `feat/tsk-001-tickets-api`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — TSK-004: "jerarquías y relaciones entre tareas, con validaciones de grafos."
- **S2** — Acceptance: "rechaza autorreferencias/ciclos; subtareas y épicas correctas; etiquetas persistidas; bloqueo visible."
- **S3** — Tests: "dependencias válidas/cíclicas, archivos, relaciones borradas, subárboles."
- **S4** — Plan §4.2: "Dependencias sin ciclos ni autorreferencias; un padre no completa automáticamente sus hijos."
- **S5** — Plan §7 route: "`PUT /tickets/:id/dependencies`". Plan §6: `epics` (`id`, `project_id`, `title`, `description`, `status`, timestamps), `labels` (`id`, `project_id?`, `name`, `color`; "Global o por proyecto"), `ticket_labels` (N:N), `ticket_dependencies` ("Par único, sin ciclos").

Assumptions (decided here, not in the plan):
- A1: Epic routes (not in §7): `GET/POST /projects/:projectId/epics`, `GET/PATCH /epics/:id`, `POST /epics/:id/archive|restore`. Epic statuses `planned|in_progress|done|canceled` (CORE-002 A1). No DELETE.
- A2: Label routes (not in §7): `GET /labels?projectId=` (global labels plus that project's), `POST /labels`, `PATCH /labels/:id`, `DELETE /labels/:id`. Labels are tags, not content, so DELETE is physical and removes the label from every ticket (`ticket_labels` cascade); names are unique per scope (CORE-002 constraints) → 409 `Label "x" already exists`.
- A3: Ticket assignment: `PATCH /tickets/:id` accepts `parentId` and `epicId` (uuid or null); `PUT /tickets/:id/labels { labelIds }` and `PUT /tickets/:id/dependencies { dependsOnTicketIds }` replace the whole set (idempotent).
- A4: Parent, epic, labels and dependencies must belong to the ticket's project (labels may also be global). Otherwise 400 `… must belong to the same project`. Unknown ids → 404.
- A5: Graph rules: a ticket cannot be its own parent or depend on itself (400 `A ticket cannot be its own parent` / `A ticket cannot depend on itself`); setting a parent that is a descendant → 409 `Parent would create a cycle`; a dependency set that closes a cycle → 409 `Dependency would create a cycle: SB-001 → SB-002 → SB-001`. Graph writes take a per-project advisory transaction lock so concurrent writes cannot jointly create a cycle.
- A6: Archived targets: a new parent, epic or dependency that is archived → 409 (`Cannot link to an archived ticket` / `Cannot assign an archived epic`). Existing links to later-archived items stay.
- A7: Blocking is visible on every ticket DTO: `dependsOnTicketIds`, `labelIds` and `isBlocked` (true when any dependency is not `done`/`canceled` and not archived).
- A8: List filters added to `GET /projects/:projectId/tickets`: `epicId`, `parentId` (uuid, or `none` for top-level tickets), `labelId`.
- A9: Activity events: parent/epic changes appear in `ticket.updated` changes (`parentId`, `epicId`); `ticket.labels_changed` and `ticket.dependencies_changed` with payload `{ added: [...], removed: [...] }`; no event when the set does not change.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2, S5 | inline | pending | epics module + `epicId` on tickets |
| T2 | S2, S3, S5 | inline | pending | labels module + `PUT /tickets/:id/labels` |
| T3 | S1–S4 | inline | pending | parent/subtasks with cycle prevention + list filters |
| T4 | S1–S5 | inline | pending | dependencies with cycle detection + `isBlocked` |

Route evidence: every unit edits the shared tickets service, mapper and contracts (not disjoint), so no parallel writer reason; inline, sequential.
Risk: item 4 (concurrency — graph validation under concurrent writes). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-01, user): "sigamos" — continuing after TSK-001; next backend ticket TSK-004.
