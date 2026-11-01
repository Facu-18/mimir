# DOC-001 (API) — Documents

Objective: backend half of DOC-001 — documents stored as Tiptap JSON with server-derived search text, project linking, safe concurrent saves, archive and Markdown export. The editor UI waits for the frontend.
Branch: `feat/doc-001-documents-api` (stacked on `feat/tsk-004-ticket-relations`) · Delivery: `ask-on-risk` · Test runner: Vitest (`pnpm test`, `pnpm test:e2e` in `apps/api`; `pnpm test` in `packages/contracts`).

## Specs

- **S1** — DOC-001: "documentos y notas, formato enriquecido, links, código, imágenes, autoguardado y exportación Markdown."
- **S2** — Acceptance: "contenido conserva formato tras reabrir; autosave indica estado; navegación segura; exportación coherente."
- **S3** — Tests: "escribir, formatos, pegar, guardar, reabrir, error de guardado, exportar."
- **S4** — Plan §4.3: "Editor Tiptap con párrafos, headings, listas, checklist, citas, links, bloques de código, imágenes, separadores y atajos Markdown. Guardar JSON estructurado y texto derivado para búsqueda. Crear, editar, archivar, enlazar con proyecto y exportar Markdown. Recuperar ante errores; no perder cambios al navegar."
- **S5** — Plan §7: "`GET/POST /documents`; `GET/PATCH /documents/:id`; `POST /documents/:id/archive`; `GET /documents/:id/export`".

Assumptions (decided here, not in the plan):
- A1: Content is a Tiptap/ProseMirror JSON document (`{ type: 'doc', content: [...] }`), validated structurally (node `type`, `attrs`, `content`, `marks`, `text`); unknown node types are stored as-is (the editor owns the schema) but export only renders the §4.3 node set and falls back to their text.
- A2: The server derives `contentText` from the JSON (blocks separated by newlines); clients never send it.
- A3: Safety: link `href` and image `src` must be `http(s):`, `mailto:` (links only), or relative (`/…`, `#…`); anything else (e.g. `javascript:`) → 400. Request bodies are limited to 2 MB (413 above).
- A4: Autosave conflicts: plan §6 has no revision column for documents, so PATCH accepts an optional `expectedUpdatedAt`; if the stored `updatedAt` differs → 409 `Document was modified elsewhere` with the current document in `current`, and nothing is written. Without it, last write wins.
- A5: `projectId` is optional on create and can be changed or cleared with PATCH (link/unlink); unknown project → 404, archived project → 409 `Cannot link to an archived project`.
- A6: `GET /documents` filters: `projectId` (uuid or `none` for standalone), `q` (literal, case-insensitive on title and text), `archived=exclude|include|only`; ordered by `updatedAt` desc. Response `{ items }` without `contentJson` (list stays light); `GET /documents/:id` returns the full document.
- A7: Added `POST /documents/:id/restore` (not in §7), mirroring projects and tickets; archive/restore are idempotent.
- A8: `GET /documents/:id/export` (`format=markdown`, the only format) answers `text/markdown; charset=utf-8` with `Content-Disposition: attachment; filename="<slug>.md"`. Markdown covers paragraphs, headings, bullet/ordered/task lists, quotes, code blocks with language, images, horizontal rules, hard breaks, and bold/italic/strike/code/link marks, escaping Markdown control characters in text.
- A9: Out of scope here: nested documents (`parent_document_id`), image upload (CAN-003 assets), activity events for documents (PRJ-002).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1, S4 | inline | done | contract RED → GREEN 63; converters RED → GREEN 8 · `b03400c` |
| T2 | S2–S5 | inline | done | RED 14 → GREEN; 413 above 2 MB; one of two concurrent same-base saves wins · `52fcc68` |
| T3 | S2, S3, S5 | inline | done | RED 3 → GREEN; curl smoke on build (headers + body) · `e1f012b` |

Route evidence: sequential units over one module; no parallel writer reason; inline.
Risk: item 2 (security — untrusted rich content and export: URL schemes, body size). Native review: unavailable (`gentle-ai` not executable).

## Log

- L1 (2026-11-01, user): "sigamos" — continuing after TSK-004; next backend ticket DOC-001.
- L2 (2026-11-01): T1–T3 done. Checks: contracts 63/63; api unit 22/22, e2e 130/130, typecheck, oxlint (0 warnings), build; smoke export on built API. Notes: plain text trims trailing spaces per line; the global JSON body limit is now 2 MB for every endpoint (was Express default 100 kB). Tool gotcha: the Write tool decodes JSON-style unicode escapes inside file content, so the accent-stripping regex was written with literal combining characters; it now uses the Unicode property escape for marks (Mark category) instead.
- L3 (2026-11-01): Independent verifier: S4/S5 pass, all URL-scheme bypass probes rejected, conflicts hold under 20 parallel saves, Content-Disposition unbreakable. 2 blockers in export: (B1) URLs with a newline inside (validator only trimmed + checked the prefix) and unvalidated image titles let raw HTML / javascript: links into the exported Markdown; (B2) non-string alt/title and non-integer heading level were stored and crashed export with 500. One correction batch, two layers: contract rejects whitespace/control/<>"`\ anywhere in URLs and type-checks alt, title, level, start, checked, language; converter percent-encodes those characters in URLs, collapses line breaks and escapes \ and " in titles/alt, and reads attributes with typed readers so stored data can never crash export. RED → GREEN: contracts 79/79, api unit 24/24, e2e 131/131, typecheck, lint 0 warnings. Open advisories: global 2 MB limit changes 100 kB+ responses on other endpoints from 413 to normal handling (intended by A3); formatting-only export gaps (newlines inside text, 4-space indents, entities); PATCH allowed on archived documents; project-archive race on link.
- L4 (2026-11-01): Recheck at e3ed328 (blockers only): B1 FIXED, B2 FIXED. API repros → 400; rows inserted directly into the DB export inertly (commonmark + markdown-it html:true show no raw HTML element and no javascript: URL) and mistyped attributes export with 200. Image title/alt containing newlines are accepted (201) by design and neutralized on export. New advisories: markdown-it drops escaped characters from alt text; a stored non-string href exports as an empty link.
