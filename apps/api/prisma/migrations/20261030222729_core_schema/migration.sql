-- CreateEnum
CREATE TYPE "project_status" AS ENUM ('active', 'paused', 'completed', 'archived');

-- CreateEnum
CREATE TYPE "epic_status" AS ENUM ('planned', 'in_progress', 'done', 'canceled');

-- CreateEnum
CREATE TYPE "ticket_type" AS ENUM ('task', 'bug', 'feature', 'improvement');

-- CreateEnum
CREATE TYPE "ticket_status" AS ENUM ('backlog', 'todo', 'in_progress', 'in_review', 'done', 'canceled');

-- CreateEnum
CREATE TYPE "ticket_priority" AS ENUM ('none', 'low', 'medium', 'high', 'urgent');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('workspace', 'project', 'epic', 'ticket', 'document', 'canvas', 'asset');

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon" TEXT,
    "color" TEXT,
    "status" "project_status" NOT NULL DEFAULT 'active',
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_counters" (
    "project_id" UUID NOT NULL,
    "next_ticket_number" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "project_counters_pkey" PRIMARY KEY ("project_id")
);

-- CreateTable
CREATE TABLE "epics" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "epic_status" NOT NULL DEFAULT 'planned',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "epics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "parent_id" UUID,
    "epic_id" UUID,
    "title" TEXT NOT NULL,
    "description_json" JSONB,
    "description_text" TEXT NOT NULL DEFAULT '',
    "type" "ticket_type" NOT NULL DEFAULT 'task',
    "status" "ticket_status" NOT NULL DEFAULT 'backlog',
    "priority" "ticket_priority" NOT NULL DEFAULT 'none',
    "sort_order" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "due_at" TIMESTAMPTZ(3),
    "completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_dependencies" (
    "ticket_id" UUID NOT NULL,
    "depends_on_ticket_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ticket_dependencies_pkey" PRIMARY KEY ("ticket_id","depends_on_ticket_id")
);

-- CreateTable
CREATE TABLE "labels" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL,

    CONSTRAINT "labels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ticket_labels" (
    "ticket_id" UUID NOT NULL,
    "label_id" UUID NOT NULL,

    CONSTRAINT "ticket_labels_pkey" PRIMARY KEY ("ticket_id","label_id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "parent_document_id" UUID,
    "title" TEXT NOT NULL,
    "content_json" JSONB,
    "content_text" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvases" (
    "id" UUID NOT NULL,
    "project_id" UUID,
    "title" TEXT NOT NULL,
    "scene_json" JSONB NOT NULL,
    "scene_schema_version" INTEGER NOT NULL DEFAULT 1,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "thumbnail_asset_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "archived_at" TIMESTAMPTZ(3),

    CONSTRAINT "canvases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assets" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" BIGINT NOT NULL,
    "checksum" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "canvas_assets" (
    "canvas_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,

    CONSTRAINT "canvas_assets_pkey" PRIMARY KEY ("canvas_id","asset_id")
);

-- CreateTable
CREATE TABLE "entity_links" (
    "id" UUID NOT NULL,
    "source_type" "entity_type" NOT NULL,
    "source_id" UUID NOT NULL,
    "target_type" "entity_type" NOT NULL,
    "target_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_events" (
    "id" UUID NOT NULL,
    "entity_type" "entity_type" NOT NULL,
    "entity_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload_json" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activity_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value_json" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "projects_workspace_id_status_idx" ON "projects"("workspace_id", "status");

-- CreateIndex
CREATE INDEX "projects_created_at_idx" ON "projects"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_workspace_id_key_key" ON "projects"("workspace_id", "key");

-- CreateIndex
CREATE INDEX "epics_project_id_status_idx" ON "epics"("project_id", "status");

-- CreateIndex
CREATE INDEX "tickets_project_id_status_sort_order_idx" ON "tickets"("project_id", "status", "sort_order");

-- CreateIndex
CREATE INDEX "tickets_parent_id_idx" ON "tickets"("parent_id");

-- CreateIndex
CREATE INDEX "tickets_epic_id_idx" ON "tickets"("epic_id");

-- CreateIndex
CREATE INDEX "tickets_due_at_idx" ON "tickets"("due_at");

-- CreateIndex
CREATE INDEX "tickets_created_at_idx" ON "tickets"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "tickets_project_id_number_key" ON "tickets"("project_id", "number");

-- CreateIndex
CREATE INDEX "ticket_dependencies_depends_on_ticket_id_idx" ON "ticket_dependencies"("depends_on_ticket_id");

-- CreateIndex
CREATE UNIQUE INDEX "labels_project_id_name_key" ON "labels"("project_id", "name");

-- CreateIndex
CREATE UNIQUE INDEX "labels_global_name_key" ON "labels"("name") WHERE (project_id IS NULL);

-- CreateIndex
CREATE INDEX "ticket_labels_label_id_idx" ON "ticket_labels"("label_id");

-- CreateIndex
CREATE INDEX "documents_project_id_idx" ON "documents"("project_id");

-- CreateIndex
CREATE INDEX "documents_parent_document_id_idx" ON "documents"("parent_document_id");

-- CreateIndex
CREATE INDEX "documents_created_at_idx" ON "documents"("created_at");

-- CreateIndex
CREATE INDEX "canvases_project_id_idx" ON "canvases"("project_id");

-- CreateIndex
CREATE INDEX "canvases_created_at_idx" ON "canvases"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "assets_storage_key_key" ON "assets"("storage_key");

-- CreateIndex
CREATE INDEX "assets_checksum_idx" ON "assets"("checksum");

-- CreateIndex
CREATE INDEX "canvas_assets_asset_id_idx" ON "canvas_assets"("asset_id");

-- CreateIndex
CREATE INDEX "entity_links_target_type_target_id_idx" ON "entity_links"("target_type", "target_id");

-- CreateIndex
CREATE UNIQUE INDEX "entity_links_source_type_source_id_target_type_target_id_key" ON "entity_links"("source_type", "source_id", "target_type", "target_id");

-- CreateIndex
CREATE INDEX "activity_events_entity_type_entity_id_created_at_idx" ON "activity_events"("entity_type", "entity_id", "created_at");

-- CreateIndex
CREATE INDEX "activity_events_created_at_idx" ON "activity_events"("created_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_counters" ADD CONSTRAINT "project_counters_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "epics" ADD CONSTRAINT "epics_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "tickets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_epic_id_fkey" FOREIGN KEY ("epic_id") REFERENCES "epics"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_dependencies" ADD CONSTRAINT "ticket_dependencies_depends_on_ticket_id_fkey" FOREIGN KEY ("depends_on_ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "labels" ADD CONSTRAINT "labels_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ticket_labels" ADD CONSTRAINT "ticket_labels_label_id_fkey" FOREIGN KEY ("label_id") REFERENCES "labels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_parent_document_id_fkey" FOREIGN KEY ("parent_document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvases" ADD CONSTRAINT "canvases_thumbnail_asset_id_fkey" FOREIGN KEY ("thumbnail_asset_id") REFERENCES "assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_assets" ADD CONSTRAINT "canvas_assets_canvas_id_fkey" FOREIGN KEY ("canvas_id") REFERENCES "canvases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "canvas_assets" ADD CONSTRAINT "canvas_assets_asset_id_fkey" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK constraints (not expressible in the Prisma schema)
ALTER TABLE "projects"
  ADD CONSTRAINT "projects_key_format" CHECK ("key" ~ '^[A-Z][A-Z0-9]{1,9}$');

ALTER TABLE "project_counters"
  ADD CONSTRAINT "project_counters_next_ticket_number_positive" CHECK ("next_ticket_number" >= 1);

ALTER TABLE "tickets"
  ADD CONSTRAINT "tickets_number_positive" CHECK ("number" >= 1),
  ADD CONSTRAINT "tickets_no_self_parent" CHECK ("parent_id" IS NULL OR "parent_id" <> "id");

ALTER TABLE "ticket_dependencies"
  ADD CONSTRAINT "ticket_dependencies_no_self_reference" CHECK ("ticket_id" <> "depends_on_ticket_id");

ALTER TABLE "documents"
  ADD CONSTRAINT "documents_no_self_parent" CHECK ("parent_document_id" IS NULL OR "parent_document_id" <> "id");

ALTER TABLE "canvases"
  ADD CONSTRAINT "canvases_revision_non_negative" CHECK ("revision" >= 0),
  ADD CONSTRAINT "canvases_scene_schema_version_positive" CHECK ("scene_schema_version" >= 1);

ALTER TABLE "assets"
  ADD CONSTRAINT "assets_size_bytes_non_negative" CHECK ("size_bytes" >= 0);
