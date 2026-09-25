-- Phase 10: auto-assign rules, Telegram welcome session nonce
CREATE TABLE "auto_assign_rules" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "channel" TEXT,
    "tag_name" TEXT,
    "assignee_id" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "auto_assign_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "auto_assign_rules_workspace_id_sort_order_idx" ON "auto_assign_rules"("workspace_id", "sort_order");

ALTER TABLE "auto_assign_rules" ADD CONSTRAINT "auto_assign_rules_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "auto_assign_rules" ADD CONSTRAINT "auto_assign_rules_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD COLUMN "start_session_nonce" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "conversations" ADD COLUMN "welcome_sent_nonce" INTEGER NOT NULL DEFAULT 0;
