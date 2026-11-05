# CAN-004 (API) — Canvas previews and links

Objective: backend half of CAN-004. Listing, creating, renaming, archiving and project association already exist from CAN-002; this adds preview references and navigable links. The library screen waits for the frontend.
Branch: `feat/can-004-canvas-links` (stacked on `feat/can-003-assets-api`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — CAN-004: "listar, crear, renombrar, archivar, asociar lienzo libre a proyecto, vistas previas y enlaces."
- **S2** — Acceptance: "lienzo sin proyecto; reasociación no altera escena; sin duplicados; enlaces navegables."
- **S3** — Tests: "lienzo libre, reasociación, archivo/restauración, búsqueda por título, links."
- **S4** — Plan §4.4: "Mantener relación futura entre elementos del canvas y entidades (ticket/proyecto/documento) mediante vínculos separados; no modificar internals de Excalidraw para V1." · Plan §6: "`entity_links` | `id`, `source_type/id`, `target_type/id`, `created_at` | Validar recursos existentes".

Out of scope: the library UI; generating preview images (Excalidraw renders them on the client); links from elements inside a scene; listing the canvases linked to a ticket, project or document.

Assumptions (decided here, not in the plan):
- A1: A preview is an ordinary asset. The client renders it, uploads it with `POST /canvases/:id/assets` and sets it with `PATCH /canvases/:id { thumbnailAssetId }` (`null` clears). Unknown asset → 404 `Asset not found`. This never touches the scene or `revision`. Replaced previews stay stored; nothing deletes assets yet.
- A2: Links go from a canvas to a project, ticket or document, per S4. Canvas-to-canvas is not offered, which also avoids deciding whether A→B duplicates B→A.
- A3: Routes (not in §7): `GET` and `POST /canvases/:id/links`, `DELETE /canvases/:id/links/:linkId`. `POST` takes `{ targetType, targetId }`.
- A4: A repeated link → 409 `Link already exists`. The unique index decides, so concurrent requests cannot duplicate it.
- A5: A link answers `{ id, targetType, targetId, title, code, archived, createdAt }`, enough to show and open the target without another request. `code` is the ticket code, `null` otherwise.
- A6: Unknown target → 404 `<Type> not found`. Archived target at creation → 409 `Cannot link to an archived <type>`, as project association does. A target archived later stays listed with `archived: true`. Links are removed physically, like labels, because they are tags with no history; an archived canvas keeps and accepts links, as it accepts saves.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S2, S3 | inline | done | Previews, and a library flow test over the CAN-002 routes: RED 3 → GREEN |
| T2 | S1–S4 | inline | done | Links: RED 15 → GREEN; 10 parallel creations give one 201 and nine 409 |

Route evidence: one module, sequential; no parallel writer reason; inline.
Risk: none (additive routes and an optional PATCH field over existing tables; no migration).

## Log

- L1 (2026-11-05, user): "lo dejamos así, y vamos con la siguiente etapa" — read as the next ticket in plan §9, CAN-004; the user was told and can redirect.
- L2 (2026-11-05): T1–T2 done. Checks: contracts 95/95, api unit 39/39, e2e 196/196, typecheck, lint, build. Two tests passed before any change: the library flow, because those routes already existed, and the 404 on listing links of an unknown canvas, because the route was missing. The other 18 failed first. Open: the UI, and listing which canvases link to a given ticket, project or document.
