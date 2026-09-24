-- AlterTable
ALTER TABLE "users" ADD COLUMN "login_fail_count" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "users" ADD COLUMN "locked_until" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "workspaces" ADD COLUMN "sla_minutes" INTEGER NOT NULL DEFAULT 15;
