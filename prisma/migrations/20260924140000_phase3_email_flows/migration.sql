-- Phase 3: several named linear flows + published flag
ALTER TABLE "flows" ADD COLUMN IF NOT EXISTS "published" BOOLEAN NOT NULL DEFAULT true;
