-- Phase 9: snooze, archive, working hours
ALTER TABLE "conversations" ADD COLUMN "archived" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "conversations" ADD COLUMN "snoozed_until" TIMESTAMP(3);

ALTER TABLE "workspaces" ADD COLUMN "work_hours_enabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "workspaces" ADD COLUMN "work_hours_start" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "workspaces" ADD COLUMN "work_hours_end" TEXT NOT NULL DEFAULT '18:00';
ALTER TABLE "workspaces" ADD COLUMN "work_hours_tz" TEXT NOT NULL DEFAULT 'Europe/Moscow';

CREATE INDEX "conversations_workspace_id_archived_idx" ON "conversations"("workspace_id", "archived");
CREATE INDEX "conversations_workspace_id_snoozed_until_idx" ON "conversations"("workspace_id", "snoozed_until");
