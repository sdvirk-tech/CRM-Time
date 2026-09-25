ALTER TABLE "workspaces" ADD COLUMN "chat_greeting" TEXT NOT NULL DEFAULT '';

ALTER TABLE "webhook_deliveries" ADD COLUMN "attempt" INTEGER NOT NULL DEFAULT 1;

CREATE TABLE "workspace_api_keys" (
    "id" TEXT NOT NULL,
    "workspace_id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "key_prefix" TEXT NOT NULL,
    "key_hash" TEXT NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "workspace_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "workspace_api_keys_workspace_id_created_at_idx" ON "workspace_api_keys"("workspace_id", "created_at" DESC);
CREATE INDEX "workspace_api_keys_key_hash_idx" ON "workspace_api_keys"("key_hash");

ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;
