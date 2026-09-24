-- Phase 2: workspace sales prompt, routing, follow-up ping markers
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "sales_prompt" TEXT NOT NULL DEFAULT '';
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "routing_mode" TEXT NOT NULL DEFAULT 'pool';
ALTER TABLE "workspaces" ADD COLUMN IF NOT EXISTS "round_robin_at" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ping_drafted_at" TIMESTAMP(3);
ALTER TABLE "conversations" ADD COLUMN IF NOT EXISTS "ping_sent_at" TIMESTAMP(3);
