-- AlterTable
ALTER TABLE "contacts" ADD COLUMN "consent_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "fx_snapshots" (
    "id" TEXT NOT NULL,
    "as_of" TIMESTAMP(3) NOT NULL,
    "usd" TEXT NOT NULL,
    "cny" TEXT NOT NULL,
    "eur" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'cbr',
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fx_snapshots_pkey" PRIMARY KEY ("id")
);
