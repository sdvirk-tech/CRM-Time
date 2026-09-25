ALTER TABLE "workspaces" ADD COLUMN "ingest_rate_limit_max" INTEGER NOT NULL DEFAULT 60;
ALTER TABLE "workspaces" ADD COLUMN "ingest_rate_limit_scope" TEXT NOT NULL DEFAULT 'ip';

CREATE TABLE "saved_views" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "screen" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "query_json" JSONB NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "saved_views_workspace_id_screen_name_key" ON "saved_views"("workspace_id", "screen", "name");
CREATE INDEX "saved_views_workspace_id_screen_idx" ON "saved_views"("workspace_id", "screen");

ALTER TABLE "saved_views" ADD CONSTRAINT "saved_views_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
