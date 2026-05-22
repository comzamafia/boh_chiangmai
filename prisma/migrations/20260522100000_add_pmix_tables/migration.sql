-- PMIX (Product Mix) tables — idempotent migration

CREATE TABLE IF NOT EXISTS "pmix_uploads" (
  "id"          TEXT NOT NULL,
  "fileName"    TEXT NOT NULL,
  "periodLabel" TEXT,
  "totalItems"  INTEGER NOT NULL DEFAULT 0,
  "totalQty"    INTEGER NOT NULL DEFAULT 0,
  "totalSales"  DECIMAL(12,2) NOT NULL DEFAULT 0,
  "uploadedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pmix_uploads_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pmix_items" (
  "id"             TEXT NOT NULL,
  "uploadId"       TEXT NOT NULL,
  "menu"           TEXT NOT NULL,
  "category"       TEXT NOT NULL,
  "itemCode"       TEXT,
  "itemName"       TEXT NOT NULL,
  "qtySold"        INTEGER NOT NULL DEFAULT 0,
  "grossSales"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundQty"      INTEGER NOT NULL DEFAULT 0,
  "refundAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netSales"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pctNetCount"    DECIMAL(8,4),
  "pctNetSales"    DECIMAL(8,4),
  "recipeId"       TEXT,
  CONSTRAINT "pmix_items_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pmix_items_uploadId_idx" ON "pmix_items"("uploadId");

CREATE TABLE IF NOT EXISTS "pmix_modifiers" (
  "id"             TEXT NOT NULL,
  "itemId"         TEXT NOT NULL,
  "modifierGroup"  TEXT NOT NULL,
  "modifier"       TEXT NOT NULL,
  "qtySold"        INTEGER NOT NULL DEFAULT 0,
  "grossSales"     DECIMAL(12,2) NOT NULL DEFAULT 0,
  "refundQty"      INTEGER NOT NULL DEFAULT 0,
  "refundAmount"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "netSales"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  CONSTRAINT "pmix_modifiers_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pmix_modifiers_itemId_idx" ON "pmix_modifiers"("itemId");

-- Foreign keys
ALTER TABLE "pmix_items" DROP CONSTRAINT IF EXISTS "pmix_items_uploadId_fkey";
ALTER TABLE "pmix_items" ADD CONSTRAINT "pmix_items_uploadId_fkey"
  FOREIGN KEY ("uploadId") REFERENCES "pmix_uploads"("id") ON DELETE CASCADE;

ALTER TABLE "pmix_modifiers" DROP CONSTRAINT IF EXISTS "pmix_modifiers_itemId_fkey";
ALTER TABLE "pmix_modifiers" ADD CONSTRAINT "pmix_modifiers_itemId_fkey"
  FOREIGN KEY ("itemId") REFERENCES "pmix_items"("id") ON DELETE CASCADE;
