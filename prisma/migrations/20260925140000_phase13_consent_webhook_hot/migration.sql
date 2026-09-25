-- Phase 13: consent text, embed allowlist, webhook log, onboarding dismiss

ALTER TABLE "workspaces"
  ADD COLUMN "consent_text" TEXT NOT NULL DEFAULT 'Согласен на обработку персональных данных (152-ФЗ)',
  ADD COLUMN "embed_allowed_origins" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "onboarding_checklist_dismissed_at" TIMESTAMP(3);

CREATE TABLE "webhook_deliveries" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "success" BOOLEAN NOT NULL,
  "status_code" INTEGER,
  "error" TEXT,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "webhook_deliveries_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "webhook_deliveries_workspace_id_created_at_idx" ON "webhook_deliveries"("workspace_id", "created_at" DESC);

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_workspace_id_fkey"
  FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_lead_id_fkey"
  FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
