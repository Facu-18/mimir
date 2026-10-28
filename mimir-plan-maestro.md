# Mimir — Plan maestro de producto y especificación técnica

> **Versión:** 1.0 · **Estado:** Planificación del MVP · **Idioma:** Español  
> **Producto:** Gestor personal de proyectos, tareas, documentos e ideas visuales.  
> **Plataformas:** Windows inicialmente; arquitectura compatible con Linux, macOS y web.  
> **Filosofía:** local-first, single-user, simple de usar, extensible para IA y MCP.

---

## 1. Visión del producto

**Mimir** es un workspace personal que combina la gestión de tareas de Linear, la documentación de Notion y la libertad de un lienzo infinito estilo Excalidraw. Permitirá ordenar proyectos de software, organizar tickets, registrar decisiones técnicas y capturar ideas sin imponerles estructura.

**Primera versión (MVP):** proyectos, tickets, subtareas, dependencias, Kanban, notas, documentos, lienzos libres con imágenes/formas/textos, búsqueda, preferencias, respaldo y experiencia de escritorio.

**Más adelante (fuera del MVP):** asistente de IA con Ollama o API para transformar lenguaje natural en proyectos y tickets; servidor MCP interoperable con Claude Code, OpenCode, Codex y otros clientes; ejecución de agentes, sincronización entre computadoras y colaboración.

### 1.1 Principios

1. **Captura sin fricción:** crear una idea o tarea en pocos segundos.
2. **Libertad creativa:** un canvas puede existir sin pertenecer a ningún proyecto.
3. **Fluidez nativa:** interacciones con teclado, mouse, trackpad, menús contextuales y transiciones sutiles.
4. **Datos propios y locales:** funcionalidades centrales sin internet y con backup/restore.
5. **Estructura preparada para agentes:** IDs estables, servicios de dominio y API tipada; no implementar el MCP todavía.
6. **Control humano:** en fases futuras la IA propone, el usuario revisa y los agentes ejecutan con permisos explícitos.

### 1.2 Límites de V1

No incluir generación de tickets con IA, servidor MCP, ejecución remota de agentes, multiusuario, sincronización entre PC, RAG, calendario avanzado ni colaboración en tiempo real. No convertir el MVP en un clon integral de Notion.

---

## 2. Stack técnico

| Capa | Elección | Uso |
|---|---|---|
| Desktop | Tauri 2 | Ventana nativa e integración con sistema operativo |
| Frontend | Next.js + React + TypeScript | UI y navegación; exportación estática para Tauri |
| Backend | NestJS + TypeScript | API REST y lógica de negocio |
| Persistencia | PostgreSQL + Prisma | Datos relacionales y migraciones |
| Contratos | Zod | Validación y esquemas compartidos |
| UI | Tailwind CSS + CSS variables + shadcn/ui/Radix | Sistema visual accesible |
| Animaciones | Motion + CSS | Transiciones, springs y gestos |
| Estado | TanStack Query + Zustand | Datos remotos/locales y estado de interfaz |
| Kanban | dnd-kit | Ordenamiento y arrastre |
| Documentos | Tiptap | Editor enriquecido |
| Lienzo | `@excalidraw/excalidraw` | Canvas infinito, dibujos, formas e imágenes |
| Monorepo | pnpm workspaces | Organización y paquetes compartidos |
| Tests | Vitest/Jest según proyecto, Supertest, Testing Library, Playwright | Calidad por capas |

**Decisión desktop:** Next.js debe configurarse con `output: 'export'` y no depender de SSR, Server Actions ni API Routes para las funciones centrales. NestJS corre como servicio local independiente, empaquetado o administrado según el sistema operativo. **No asumir** que Tauri distribuye automáticamente Node y PostgreSQL: crear y validar una estrategia reproducible de instalador, runtime y base local. La V1 puede requerir PostgreSQL instalado/configurado, y debe declarar ese requisito con claridad.

**Decisión canvas:** integrar Excalidraw como biblioteca React, sin reimplementar su motor. Evaluar compatibilidad/licencia y versionar el formato de escenas y archivos asociados. Mantener una capa `CanvasRepository` propia para no acoplar persistencia a detalles internos de la biblioteca.

---

## 3. Diseño y experiencia de uso

**Dirección:** *Lo-fi Native Glass*: sobria, tranquila y cálida; glassmorphism ligero sin blurs excesivos ni brillos molestos.

### 3.1 Tokens de referencia

| Token | Color |
|---|---|
| Fondo oscuro | `#222624` |
| Superficie oscura | `#343C36` |
| Verde salvia | `#81917E` |
| Arena cálida | `#C6AF98` |
| Texto claro | `#E8DFD2` |

Los colores deben exponerse como variables CSS semánticas con versiones light/dark, y comprobar contraste real.

### 3.2 Interacciones

- Sidebar colapsable, topbar minimalista y panel de detalle redimensionable.
- Command palette con `Ctrl+K` / `Cmd+K`.
- Atajos coherentes; foco visible y navegación accesible por teclado.
- Paneles de 180–260 ms; cambio de vista 150–220 ms; hover 100–160 ms, como objetivos iniciales.
- Animar preferentemente `transform` y `opacity`; respetar `prefers-reduced-motion`.
- Autoguardado con feedback discreto: guardando, guardado, error, conflicto.
- Autocorrección/ortografía opcional y no invasiva: jamás modificar silenciosamente nombres técnicos o bloques de código.
- Menús nativos cuando convenga, tooltips, context menus, drag-and-drop y empty states útiles.
- Glass aplicado solo a superficies flotantes; nunca sacrificar claridad visual o performance.

### 3.3 Pantallas

1. **Inicio:** proyectos favoritos/recientes, pendientes, lienzos recientes y creación rápida.
2. **Proyectos:** lista, filtros, favorito, archivo y detalle.
3. **Proyecto / overview:** progreso, tickets, documentos, lienzos y actividad.
4. **Tickets / Kanban:** columnas por estado, tarjetas arrastrables, filtros y detalle lateral.
5. **Tickets / Lista:** búsqueda, orden y edición ágil.
6. **Documentos:** editor enriquecido Tiptap, enlaces y código.
7. **Ideas / Biblioteca:** lienzos libres o de proyecto, búsqueda y miniaturas.
8. **Lienzo:** canvas infinito casi a pantalla completa con herramientas de Excalidraw.
9. **Búsqueda:** command palette global.
10. **Ajustes:** tema, movimiento, almacenamiento, exportación y restauración.

---

## 4. Módulos y reglas funcionales

### 4.1 Workspace y proyectos

Jerarquía: `Workspace → Proyecto → Tickets / Documentos / Lienzos`.

El proyecto tiene UUID, clave corta estable (`SB`), nombre, descripción, icono, color, estado (`active`, `paused`, `completed`, `archived`), favorito, orden y fechas. Permitir alta, edición, favorito, archivo/restauración, búsqueda y acceso a contenido. No eliminar definitivamente por acciones rápidas.

### 4.2 Tickets

Campos: UUID, número incremental por proyecto, código legible (`SB-001`), título, descripción enriquecida y texto para búsqueda, tipo (`task`, `bug`, `feature`, `improvement`), estado (`backlog`, `todo`, `in_progress`, `in_review`, `done`, `canceled`), prioridad, fecha de vencimiento opcional, épica, padre, etiquetas, posición, criterios de aceptación, dependencias y timestamps.

Requisitos:
- CRUD, duplicar y archivar, con edición inline y detalle lateral.
- Kanban y lista con filtros, ordenamientos y reordenamiento persistido.
- IDs legibles inmutables aunque cambie el nombre/clave visible del proyecto.
- Numeración atómica y única por proyecto, incluso con creaciones concurrentes.
- Dependencias sin ciclos ni autorreferencias; un padre no completa automáticamente sus hijos.
- Historial de cambios relevantes mediante eventos de actividad.
- Optimizaciones sin saltos visuales ni tarjetas duplicadas; rollback al fallar el servidor.

### 4.3 Documentos

Editor Tiptap con párrafos, headings, listas, checklist, citas, links, bloques de código, imágenes, separadores y atajos Markdown. Guardar JSON estructurado y texto derivado para búsqueda. Crear, editar, archivar, enlazar con proyecto y exportar Markdown. Recuperar ante errores; no perder cambios al navegar.

### 4.4 Ideas y lienzo infinito

**Este es un módulo central, no un complemento.** Dos tipos:
- **Libre:** lienzo sin proyecto; capturar ideas al aire.
- **De proyecto:** asociado a un proyecto; diagramas, arquitectura, flujos y planificación.

Funciones mínimas: texto, rectángulos, círculos/elipses, rombos, flechas, líneas, dibujo a mano, imágenes, selección múltiple, agrupación, zoom/pan, copiar/pegar, duplicar, undo/redo, insertar por arrastre, centrar y ajustar contenido.

Persistencia:
- Escena en JSON con versión de esquema, revisión y timestamps.
- Imágenes/adjuntos en directorio administrado y referencias estables, no rutas temporales.
- Autoguardado con debounce y control de revisión optimista (`409 Conflict` si la escena remota es más reciente).
- Señalizar error de guardado, preparar recuperación local de cambios recientes y mantener backup de escenas antes de migrarlas.
- Exportar formato propio editable y PNG/SVG según capacidades de Excalidraw.
- Un lienzo libre puede asociarse a proyecto sin alterar elementos ni perder referencias.
- Mantener relación futura entre elementos del canvas y entidades (ticket/proyecto/documento) mediante vínculos separados; no modificar internals de Excalidraw para V1.

### 4.5 Dashboard, búsqueda y ajustes

Dashboard: favoritos, recientes, pendientes, vencimientos, actividad y accesos rápidos a nuevas ideas/tareas. Mostrar datos reales, no métricas decorativas.

Búsqueda global: proyectos, tickets, documentos (texto) y lienzos (nombre), con resultados agrupados y navegación por teclado; SQL full-text cuando resulte útil. No introducir embeddings en V1.

Ajustes: light/dark/system, movimiento, preferencias editor, carpeta de datos, backup/restore, versión. Preferencias persistidas.

### 4.6 Respaldo, seguridad y fiabilidad

- Backup consistente de PostgreSQL **más** imágenes/adjuntos y manifiesto versionado.
- Validar integridad antes de restaurar; crear punto de recuperación y pedir confirmación.
- API escuchando en loopback; CORS restringido y protección frente a llamadas locales no autorizadas (por ejemplo token de sesión app/backend).
- Validar tamaños, tipos MIME y rutas de archivos; impedir path traversal.
- Mantener secretos fuera del frontend y no ejecutar comandos arbitrarios desde la UI.
- Migraciones versionadas, recuperación ante cierres inesperados y manejo explícito de errores.

---

## 5. Arquitectura y carpetas

```text
mimir/
├── apps/
│   ├── desktop/
│   │   └── src-tauri/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── hooks/
│   │   └── styles/
│   └── api/
│       ├── src/
│       │   ├── modules/
│       │   ├── common/
│       │   └── main.ts
│       └── prisma/
├── packages/
│   ├── contracts/
│   ├── domain/
│   ├── ui/
│   └── config/
├── docs/
│   ├── architecture/
│   ├── decisions/
│   └── api/
├── scripts/
├── pnpm-workspace.yaml
└── README.md
```

Regla: servicios de dominio independientes de los controladores HTTP, Tauri y React. Los adapters futuros (MCP, IA) llamarán servicios existentes, no duplicarán lógica.

---

## 6. Modelo de datos propuesto

| Tabla | Campos clave | Observaciones |
|---|---|---|
| `workspaces` | `id`, `name`, timestamps | Un workspace inicial |
| `projects` | `id`, `workspace_id`, `key`, `name`, `description`, `icon`, `color`, `status`, `is_favorite`, `sort_order`, timestamps, `archived_at` | Clave por workspace única |
| `project_counters` | `project_id`, `next_ticket_number` | Reserva transaccional de número |
| `epics` | `id`, `project_id`, `title`, `description`, `status`, timestamps | Grupos de tickets |
| `tickets` | `id`, `project_id`, `number`, `parent_id`, `epic_id`, `title`, `description_json`, `description_text`, `type`, `status`, `priority`, `sort_order`, `due_at`, `completed_at`, timestamps, `archived_at` | Único `(project_id,number)` |
| `ticket_dependencies` | `ticket_id`, `depends_on_ticket_id`, `created_at` | Par único, sin ciclos |
| `labels` | `id`, `project_id?`, `name`, `color` | Global o por proyecto |
| `ticket_labels` | `ticket_id`, `label_id` | N:N |
| `documents` | `id`, `project_id?`, `parent_document_id?`, `title`, `content_json`, `content_text`, timestamps, `archived_at` | Puede ser independiente |
| `canvases` | `id`, `project_id?`, `title`, `scene_json`, `scene_schema_version`, `revision`, `thumbnail_asset_id?`, timestamps, `archived_at` | Independiente o asociado |
| `assets` | `id`, `filename`, `mime_type`, `size_bytes`, `checksum`, `storage_key`, `created_at` | Storage local seguro |
| `canvas_assets` | `canvas_id`, `asset_id` | Referencias N:N |
| `entity_links` | `id`, `source_type/id`, `target_type/id`, `created_at` | Validar recursos existentes |
| `activity_events` | `id`, `entity_type/id`, `event_type`, `payload_json`, `created_at` | Auditoría básica |
| `app_settings` | `key`, `value_json`, `updated_at` | Preferencias |

Todos los IDs internos son UUID; timestamps en UTC; borrados preferentemente lógicos. Índices en filtros habituales, `project_id`, `created_at`, `status`, y texto de búsqueda. No almacenar imágenes grandes embebidas en JSON de escenas.

---

## 7. API REST `/api/v1`

| Módulo | Rutas |
|---|---|
| Proyectos | `GET/POST /projects`; `GET/PATCH /projects/:id`; `POST /projects/:id/archive`; `POST /projects/:id/restore` |
| Tickets | `GET/POST /projects/:projectId/tickets`; `GET/PATCH /tickets/:id`; `POST /tickets/:id/duplicate`; `POST /tickets/:id/archive`; `PUT /tickets/:id/dependencies`; `PATCH /tickets/reorder` |
| Documentos | `GET/POST /documents`; `GET/PATCH /documents/:id`; `POST /documents/:id/archive`; `GET /documents/:id/export` |
| Lienzos | `GET/POST /canvases`; `GET/PATCH /canvases/:id`; `PUT /canvases/:id/scene`; `POST /canvases/:id/assets`; `GET /canvases/:id/export`; `POST /canvases/:id/archive` |
| Búsqueda | `GET /search?q=...&types=...` |
| Inicio | `GET /dashboard` |
| Preferencias | `GET/PATCH /settings` |
| Backups | `POST/GET /backups`; `POST /backups/validate`; `POST /backups/restore` |

**Contrato de guardado de canvas:** enviar `expectedRevision`, `scene`, `schemaVersion`, referencias de recursos; el backend hace compare-and-swap transaccional e incrementa `revision`. Respuesta 409 ante conflicto sin sobrescribir. Establecer límite de payload y validación de esquema.

**Contratos compartidos:** Zod en `packages/contracts`; formatos uniformes de errores, filtros, paginación y resultados. API documentada mediante OpenAPI si resulta apropiado.

---

## 8. Backlog de implementación — 8 épicas, 21 tickets

### EPIC-01 · Fundación (3 tickets)

#### CORE-001 — Inicializar monorepo
**Prioridad:** P0 · **Depende de:** ninguno  
**Descripción:** montar workspace pnpm, Next.js, NestJS, TypeScript estricto, paquetes `contracts/domain/ui`, lint, format y scripts.

**Tareas:** configurar pnpm workspaces; frontend estático; backend; aliases; scripts; estructura; README.

**Aceptación:** frontend y API arrancan; build/typecheck/lint funcionan desde raíz; estructura reproducible; sin ciclos de dependencias.

**Pruebas:** instalación limpia, build de cada app, arranque simultáneo, lint/typecheck.

#### CORE-002 — PostgreSQL + Prisma + migraciones
**Prioridad:** P0 · **Depende de:** CORE-001  
**Descripción:** conexión PostgreSQL, esquema inicial, migraciones versionadas, seed de workspace, repositorios base.

**Aceptación:** migración en BD vacía y existente; datos persistentes; errores de conexión gestionados; fixtures aislados de producción.

**Pruebas:** migración/rollback en test, integridad referencial, CRUD y fallo de conexión.

#### CORE-003 — Shell desktop Tauri
**Prioridad:** P0 · **Depende de:** CORE-001  
**Descripción:** integrar build exportable y backend local, resolver empaquetado/runtime, ventana, rutas de datos e instalador Windows.

**Aceptación:** app instalable abre sin navegador; API local disponible; persiste tras reinicio; cierre normal no deja procesos huérfanos; documenta necesidad de PostgreSQL.

**Pruebas:** máquina limpia, instalación/reapertura, puerto ocupado, backend no disponible, reinicio del SO.

### EPIC-02 · Diseño y navegación (2 tickets)

#### UI-001 — Sistema visual global
**Prioridad:** P0 · **Depende de:** CORE-001  
**Descripción:** tokens, tipografía, componentes base, accesibilidad, light/dark y Motion.

**Aceptación:** estilos consistentes, contraste legible, focus visible, reduced motion, sin blur excesivo.

**Pruebas:** snapshots/capturas, teclado, contraste, tema y animaciones reducidas.

#### UI-002 — AppShell y navegación
**Prioridad:** P0 · **Depende de:** UI-001  
**Descripción:** sidebar, topbar, rutas, panel lateral, favoritos visuales y context menus.

**Aceptación:** navegación fluida; sidebar colapsa; estado activo; ventanas pequeñas; no se pierden cambios.

**Pruebas:** rutas, resize, colapso, back/forward y atajos.

### EPIC-03 · Proyectos (2 tickets)

#### PRJ-001 — CRUD de proyectos
**Prioridad:** P0 · **Depende de:** CORE-002, UI-002  
**Descripción:** crear, listar, editar, favoritos, búsqueda, archivo y restauración con persistencia real.

**Aceptación:** claves únicas; validaciones; no duplicados; errores claros; acciones funcionales.

**Pruebas:** CRUD, duplicados de clave, archivos/restauraciones, filtros.

#### PRJ-002 — Overview de proyecto
**Prioridad:** P1 · **Depende de:** PRJ-001  
**Descripción:** home de proyecto con progreso, tickets, documentos, lienzos y actividad.

**Aceptación:** progreso consistente con estados; accesos correctos; empty states; proyecto archivado bien representado.

**Pruebas:** proyecto nuevo, completo, archivado y con contenido múltiple.

### EPIC-04 · Tareas (4 tickets)

#### TSK-001 — Modelo y API de tickets
**Prioridad:** P0 · **Depende de:** PRJ-001  
**Descripción:** CRUD, tipos, estados, prioridades, numeración y validaciones.

**Aceptación:** código `KEY-NNN` estable; número único transaccional; CRUD; búsqueda por código; reglas en backend.

**Pruebas:** creación concurrente, actualización, filtros, colisión, datos inválidos.

#### TSK-002 — Tablero Kanban
**Prioridad:** P0 · **Depende de:** TSK-001, UI-002  
**Descripción:** columnas, tarjetas, drag-and-drop, reordenamiento persistente y optimistic UI.

**Aceptación:** cambio de estado/orden persiste; sin duplicados; error revierte el movimiento; accesible.

**Pruebas:** mover en columna, entre columnas, recarga, error API, interacción por teclado.

#### TSK-003 — Lista y panel de ticket
**Prioridad:** P0 · **Depende de:** TSK-001  
**Descripción:** listado filtrable y detalle lateral con edición de título, descripción y propiedades.

**Aceptación:** combinar filtros; datos persistidos; acceso directo por código; navegación no pierde cambios.

**Pruebas:** filtro/orden, edición, actualización, contenido largo, errores.

#### TSK-004 — Épicas, subtareas, etiquetas y dependencias
**Prioridad:** P1 · **Depende de:** TSK-001  
**Descripción:** jerarquías y relaciones entre tareas, con validaciones de grafos.

**Aceptación:** rechaza autorreferencias/ciclos; subtareas y épicas correctas; etiquetas persistidas; bloqueo visible.

**Pruebas:** dependencias válidas/cíclicas, archivos, relaciones borradas, subárboles.

### EPIC-05 · Documentación (1 ticket)

#### DOC-001 — Editor enriquecido Tiptap
**Prioridad:** P1 · **Depende de:** CORE-002, UI-002  
**Descripción:** documentos y notas, formato enriquecido, links, código, imágenes, autoguardado y exportación Markdown.

**Aceptación:** contenido conserva formato tras reabrir; autosave indica estado; navegación segura; exportación coherente.

**Pruebas:** escribir, formatos, pegar, guardar, reabrir, error de guardado, exportar.

### EPIC-06 · Lienzo infinito (4 tickets)

#### CAN-001 — Integrar motor Excalidraw
**Prioridad:** P0 · **Depende de:** CORE-001, UI-002  
**Descripción:** lienzo infinito embebido, formas, texto, imágenes, dibujo, zoom/pan y atajos.

**Aceptación:** render client-only sin errores de hidratación; herramientas funcionales; atajos del canvas no interfieren con la app; buena fluidez.

**Pruebas:** texto, formas, agrupación, undo/redo, selección, pan, zoom y retorno al lienzo.

#### CAN-002 — Persistencia y recuperación de escenas
**Prioridad:** P0 · **Depende de:** CAN-001, CORE-002  
**Descripción:** CRUD lienzos, escena versionada, autosave con debounce, conflicto 409, recuperación y exportación editable.

**Aceptación:** reabrir restaura exactamente elementos; no hay sobrescritura por respuestas antiguas; falla visible; schema versionado.

**Pruebas:** edición rápida, conflicto concurrente, cierre inesperado, escena extensa, recuperación.

#### CAN-003 — Imágenes y assets
**Prioridad:** P0 · **Depende de:** CAN-002  
**Descripción:** adjuntar/arrastrar/pegar imágenes, validar tipo y tamaño, almacenamiento estable y exportación PNG/SVG.

**Aceptación:** imágenes sobreviven reinicio/backup; sin rutas temporales; validación y protección path traversal; exportación conserva recursos.

**Pruebas:** PNG/JPEG/WebP soportados, inválidos, pesados, drag-drop, portapapeles, restore.

#### CAN-004 — Biblioteca de lienzos y vínculos
**Prioridad:** P1 · **Depende de:** CAN-002, PRJ-001  
**Descripción:** listar, crear, renombrar, archivar, asociar lienzo libre a proyecto, vistas previas y enlaces.

**Aceptación:** lienzo sin proyecto; reasociación no altera escena; sin duplicados; enlaces navegables.

**Pruebas:** lienzo libre, reasociación, archivo/restauración, búsqueda por título, links.

### EPIC-07 · Productividad (2 tickets)

#### DASH-001 — Dashboard personal
**Prioridad:** P1 · **Depende de:** PRJ-001, TSK-001, CAN-004  
**Descripción:** recientes, favoritos, pendientes, actividad, nueva tarea/idea y navegación rápida.

**Aceptación:** datos reales; estados vacíos; carga estable; shortcuts funcionales.

**Pruebas:** workspace vacío, varios proyectos, cambio de tareas y navegación.

#### SRCH-001 — Búsqueda global y command palette
**Prioridad:** P1 · **Depende de:** PRJ-001, TSK-001, DOC-001, CAN-004  
**Descripción:** buscar proyectos, tickets, texto de documentos y nombres de lienzos; teclado y acciones rápidas.

**Aceptación:** resultados correctos; agrupados por tipo; `Ctrl/Cmd+K`; abre la entidad correspondiente.

**Pruebas:** consulta vacía, parcial, exacta, sin resultados, navegación con teclado.

### EPIC-08 · Sistema, seguridad y QA (3 tickets)

#### SYS-001 — Preferencias de aplicación
**Prioridad:** P1 · **Depende de:** UI-001, CORE-002  
**Descripción:** tema, movimiento reducido, ajustes editor, rutas de datos y persistencia.

**Aceptación:** cambios se aplican y sobreviven reinicios; fallos de configuración controlados.

**Pruebas:** cambio de tema, restore defaults, reinicio, valores inválidos.

#### SYS-002 — Backup y restauración
**Prioridad:** P0 antes de release · **Depende de:** CORE-002, DOC-001, CAN-003  
**Descripción:** exportar BD+assets, manifiesto, checksums, validar antes de restaurar y crear punto de recuperación.

**Aceptación:** backup completo; restore funcional en instalación limpia; detecta corrupción; no borra datos antes de validar.

**Pruebas:** respaldo/restauración, archivo faltante, backup corrupto, compatibilidad de versión, integridad de links.

#### SYS-003 — QA y distribución Windows
**Prioridad:** P0 antes de release · **Depende de:** todos los tickets del MVP  
**Descripción:** pruebas integrales, seguridad local, rendimiento, instalador, migraciones, error recovery y documentación de release.

**Aceptación:** sin pérdidas conocidas de datos; tests pasan; build instalable; API cerrada a externos; README de instalación, operación y restauración.

**Pruebas:** máquina limpia, flujo proyecto→ticket→Kanban, lienzo→imagen→guardar→reabrir, backup/restore, cierres inesperados, base caída, actualización de versión.

**Total:** 21 tickets en 8 épicas (3+2+2+4+1+4+2+3).

---

## 9. Orden sugerido de trabajo

1. **Base:** CORE-001 → CORE-002 y CORE-003.
2. **UI:** UI-001 → UI-002.
3. **Proyectos:** PRJ-001 → PRJ-002.
4. **Tickets:** TSK-001 → TSK-002, TSK-003 y TSK-004.
5. **Canvas:** CAN-001 → CAN-002 → CAN-003 y CAN-004.
6. **Documentación/productividad:** DOC-001 → DASH-001 y SRCH-001.
7. **Sistema/release:** SYS-001 → SYS-002 → SYS-003.

Las ramas independientes pueden desarrollarse en paralelo cuando sus contratos estén estables. **Primer hito práctico:** CORE-001 + CORE-002 + CORE-003 + UI-001, para tener base técnica y visual instalable.

---

## 10. Criterios no funcionales

- **Rendimiento objetivo:** interacción inmediata, scroll fluido, ensayar con ≥500 tickets y ≥300 elementos en un canvas; medir antes de fijar SLA.
- **Accesibilidad:** foco, teclado, contraste, reduced motion y etiquetas.
- **Confiabilidad:** autoguardado, conflictos seguros, migraciones, recuperación y backups.
- **Seguridad:** loopback, autorización local, CORS, validación de archivos, límites de payload; no shell arbitrario.
- **Mantenibilidad:** TS estricto, contratos versionados, servicios aislados, pruebas y ADRs para decisiones importantes.
- **Portabilidad:** no acoplar dominio a Windows ni a Tauri.

---

## 11. Evolución V2: IA y lenguaje natural (NO implementar en V1)

Futuro flujo: texto libre → análisis IA → propuesta editable de épicas/tickets → validación Zod → revisión humana → creación mediante servicios del backend.

Modelos candidatos para evaluación: Qwen3 4B/8B en Ollama y modelos económicos mediante API. Elegir por calidad de JSON estructurado, español, latencia, privacidad y costo vigente, no por nombre de modelo fijado en este plan. Evitar que la IA invente rutas, archivos o recursos no inspeccionados.

Prever una abstracción de proveedor IA intercambiable, sin introducirla prematuramente en V1.

---

## 12. Evolución V3: MCP y agentes (NO implementar en V1)

**Objetivo:** conectar Mimir a Claude Code, OpenCode, Codex y clientes compatibles mediante un servidor MCP. Un adaptador MCP invocará **los mismos servicios de dominio** usados por la API y la UI.

Herramientas previstas:

```text
list_projects
get_project
create_project
list_tickets
get_ticket
create_ticket
update_ticket
get_ready_tickets
list_documents
get_document
list_canvases
get_canvas_context
```

Requisitos futuros: permisos por herramienta y operación; aprobación para escrituras; audit trail; idempotencia; acceso restringido a datos; contexto técnico para tickets; lectura de dependencias; estado de ejecución diferenciado del estado del ticket; nunca acceso libre a PostgreSQL o disco.

Los objetos de V1 deben tener IDs, timestamps, validaciones y contratos suficientes para habilitar este adaptador sin rediseñar el núcleo. No crear endpoints «para MCP» hasta que exista el servidor.

---

## 13. Definition of Done general del MVP

- [ ] Mimir se instala y abre en Windows como aplicación separada.
- [ ] La configuración local requerida (PostgreSQL/runtime) queda documentada y comprobada.
- [ ] El usuario crea, edita, busca, archiva y restaura proyectos.
- [ ] Crea tickets con número estable, estados y prioridades.
- [ ] Usa Kanban y lista; mueve tarjetas con persistencia y rollback ante fallos.
- [ ] Crea subtareas, épicas y dependencias sin ciclos.
- [ ] Escribe notas enriquecidas que se guardan y exportan.
- [ ] Abre un lienzo infinito sin proyecto.
- [ ] Dibuja, inserta texto, formas, conectores e imágenes.
- [ ] Guarda, cierra y reabre lienzos sin perder su escena ni recursos.
- [ ] Asocia posteriormente un lienzo libre a un proyecto.
- [ ] Usa dashboard, command palette y búsqueda.
- [ ] Configura tema y movimiento reducido.
- [ ] Exporta y restaura backups íntegros.
- [ ] Las funciones principales trabajan offline.
- [ ] Tests esenciales, lint, typecheck y build pasan.
- [ ] No hay errores conocidos de pérdida de datos o vulnerabilidades locales críticas.
- [ ] Arquitectura preparada para conectar IA/MCP posteriormente sin duplicar servicios.

---

## 14. Protocolo de trabajo para el agente implementador

Para **cada ticket**:

1. Leer este plan y las decisiones de arquitectura vigentes.
2. Inspeccionar código, dependencias, contratos, pruebas y convenciones reales.
3. Delimitar cambios, riesgos y archivos afectados.
4. Implementar lo mínimo necesario, sin refactorizaciones ajenas al alcance.
5. Crear o actualizar tests y ejecutar lint/typecheck/build aplicables.
6. Verificar migraciones y persistencia si hay cambios en datos.
7. No modificar producción ni hacer operaciones destructivas sin autorización.
8. Documentar decisiones, limitaciones y cualquier desviación del plan.
9. Reportar resumen, archivos, endpoints, migraciones, pruebas, resultados, bloqueos y ticket siguiente.
10. No declarar «Done» sin criterios de aceptación verificados.

**Regla principal:** el gestor debe ser plenamente útil sin IA; las integraciones inteligentes llegan después como una capa sobre el núcleo estable de Mimir.
