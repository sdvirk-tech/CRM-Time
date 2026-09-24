-- Phase 8: follow-up tasks, pin, reject reason, outbound webhook

ALTER TABLE "workspaces"
  ADD COLUMN "outbound_webhook_url" TEXT,
  ADD COLUMN "outbound_webhook_secret_enc" TEXT,
  ADD COLUMN "outbound_webhook_last_at" TIMESTAMP(3),
  ADD COLUMN "outbound_webhook_last_error" TEXT;

ALTER TABLE "conversations" ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leads" ADD COLUMN "reject_reason" TEXT;

CREATE TABLE "follow_ups" (
  "id" TEXT NOT NULL,
  "workspace_id" TEXT NOT NULL,
  "lead_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "due_at" TIMESTAMP(3) NOT NULL,
  "assignee_id" TEXT,
  "done_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "follow_ups_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "follow_ups_workspace_id_due_at_idx" ON "follow_ups"("workspace_id", "due_at");
CREATE INDEX "follow_ups_lead_id_idx" ON "follow_ups"("lead_id");
CREATE INDEX "follow_ups_assignee_id_idx" ON "follow_ups"("assignee_id");

ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_lead_id_fkey" FOREIGN KEY ("lead_id") REFERENCES "leads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "follow_ups" ADD CONSTRAINT "follow_ups_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
