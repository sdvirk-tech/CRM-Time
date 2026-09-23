-- AlterTable
ALTER TABLE "channels" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ai';
ALTER TABLE "conversations" ADD COLUMN "assignee_id" TEXT;

-- AlterTable
ALTER TABLE "knowledge_articles" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
