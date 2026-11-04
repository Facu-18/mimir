# CAN-002 (API) — Canvases and scene persistence

Objective: backend half of CAN-002 — canvas CRUD, versioned scenes with compare-and-swap saves (409 on conflict), an editable export, behind an own `CanvasRepository`. Debounced autosave, local recovery and the Excalidraw UI wait for the frontend; image upload is CAN-003.
Branch: `feat/can-002-canvases-api` (stacked on `feat/doc-001-documents-api`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — CAN-002: "CRUD lienzos, escena versionada, autosave con debounce, conflicto 409, recuperación y exportación editable."
- **S2** — Acceptance: "reabrir restaura exactamente elementos; no hay sobrescritura por respuestas antiguas; falla visible; schema versionado."
- **S3** — Tests: "edición rápida, conflicto concurrente, cierre inesperado, escena extensa, recuperación."
- **S4** — Plan §7 routes in scope: "`GET/POST /canvases`; `GET/PATCH /canvases/:id`; `PUT /canvases/:id/scene`; `GET /canvases/:id/export`; `POST /canvases/:id/archive`".
- **S5** — Plan §7: "**Contrato de guardado de canvas:** enviar `expectedRevision`, `scene`, `schemaVersion`, referencias de recursos; el backend hace compare-and-swap transaccional e incrementa `revision`. Respuesta 409 ante conflicto sin sobrescribir. Establecer límite de payload y validación de esquema."
- **S6** — Plan §4.4: "Escena en JSON con versión de esquema, revisión y timestamps." · "Imágenes/adjuntos en directorio administrado y referencias estables, no rutas temporales." · "Un lienzo libre puede asociarse a proyecto sin alterar elementos ni perder referencias." · Plan §6: "No almacenar imágenes grandes embebidas en JSON de escenas." · Plan §2: "Mantener una capa `CanvasRepository` propia para no acoplar persistencia a detalles internos de la biblioteca."

Out of scope: `POST /canvases/:id/assets`, asset storage and PNG/SVG export (CAN-003); thumbnails, library and links (CAN-004); debounce and local recovery (frontend); activity events (PRJ-002).

Assumptions (decided here, not in the plan):
- A1: A scene is `{ elements, appState, files }`. Elements are objects with string `id` and `type`; everything else in them is kept verbatim because Excalidraw owns that format. Only `CanvasRepository` touches scene persistence.
- A2: Resource references live in the scene: `files` maps a file id to `{ assetId, mimeType? }`. `canvas_assets` is derived from it inside the save transaction, so they cannot diverge. Unknown asset → 404 `Asset not found`. An entry with `dataURL` → 400 `Images must be uploaded as assets, not embedded in the scene`.
- A3: `schemaVersion` only accepts the current version (1) until a migration exists; otherwise 400. Scene backups before migrating are deferred to the first real scene migration.
- A4: `PUT /canvases/:id/scene { expectedRevision, schemaVersion, scene }` is an atomic conditional update on `revision`. Success answers `{ id, revision, schemaVersion, updatedAt }` without echoing the scene. A stale revision answers 409 `{ statusCode, error, message: 'Canvas was modified elsewhere', currentRevision, updatedAt }` and writes nothing; the client recovers with `GET /canvases/:id`.
- A5: Payload limits: 20 MB for JSON under `/canvases` (freehand scenes are large and images are not embedded), 2 MB elsewhere; at most 200000 elements; depth at most 64; NUL characters rejected because Postgres cannot store them in `jsonb`.
- A6: `PATCH /canvases/:id` changes only `title` and `projectId`; it never touches the scene or `revision`. Project link rules match documents: unknown → 404, archived → 409 `Cannot link to an archived project`.
- A7: Scene saves stay allowed on an archived canvas so an open tab cannot lose work, as with documents. Added `POST /canvases/:id/restore` (not in §7); archive/restore are idempotent.
- A8: `GET /canvases?projectId=<uuid|none>&q=&archived=` searches titles literally, orders by `updatedAt` desc and omits the scene.
- A9: `GET /canvases/:id/export` downloads `{ format: 'mimir-canvas', formatVersion: 1, title, schemaVersion, revision, scene }` as `<slug>.mimir-canvas.json`. It is editable because `POST /canvases` accepts `title`, `schemaVersion` and `scene` back.

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S2, S5, S6 | inline | pending | scene contract |
| T2 | S1–S6 | inline | pending | repository, CRUD, compare-and-swap, limits, archive |
| T3 | S1, S4 | inline | pending | editable export and re-import |

Route evidence: sequential units over one module; no parallel writer reason; inline.
Risk: items 1 and 4 (new persisted scene format; compare-and-swap under concurrent saves), item 5 (direct `express` dependency). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-04, user): "sigamos" — continuing after DOC-001; next backend ticket CAN-002.
