-- V3: SKU System, Storage Area Management, Multi-Supplier & MAC Engine
-- Idempotent migration — safe to re-run

-- ── 1. StorageArea table ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "storage_areas" (
    "id"          TEXT        NOT NULL,
    "name"        TEXT        NOT NULL,
    "temperature" TEXT,
    "isActive"    BOOLEAN     NOT NULL DEFAULT true,
    "sortOrder"   INTEGER     NOT NULL DEFAULT 0,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_areas_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "storage_areas_name_key" ON "storage_areas"("name");

-- ── 2. IngredientSupplier join table ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "ingredient_suppliers" (
    "id"             TEXT           NOT NULL,
    "ingredientId"   TEXT           NOT NULL,
    "supplierId"     TEXT           NOT NULL,
    "purchasePrice"  DECIMAL(10,2)  NOT NULL,
    "purchaseUnit"   TEXT           NOT NULL,
    "conversionRate" DECIMAL(10,4)  NOT NULL,
    "isPreferred"    BOOLEAN        NOT NULL DEFAULT false,
    "notes"          TEXT,
    "createdAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingredient_suppliers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_suppliers_ingredientId_supplierId_key"
    ON "ingredient_suppliers"("ingredientId", "supplierId");

-- ── 3. New columns on Ingredient ─────────────────────────────────────────────
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "sku"                    TEXT;
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "storageAreaId"          TEXT;
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "averageCostPerBaseUnit" DECIMAL(10,6);
CREATE UNIQUE INDEX IF NOT EXISTS "ingredients_sku_key" ON "ingredients"("sku");

-- ── 4. Foreign keys (drop-then-add for idempotency) ──────────────────────────
ALTER TABLE "ingredients"
    DROP CONSTRAINT IF EXISTS "ingredients_storageAreaId_fkey";
ALTER TABLE "ingredients"
    ADD CONSTRAINT "ingredients_storageAreaId_fkey"
    FOREIGN KEY ("storageAreaId") REFERENCES "storage_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ingredient_suppliers"
    DROP CONSTRAINT IF EXISTS "ingredient_suppliers_ingredientId_fkey";
ALTER TABLE "ingredient_suppliers"
    ADD CONSTRAINT "ingredient_suppliers_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ingredient_suppliers"
    DROP CONSTRAINT IF EXISTS "ingredient_suppliers_supplierId_fkey";
ALTER TABLE "ingredient_suppliers"
    ADD CONSTRAINT "ingredient_suppliers_supplierId_fkey"
    FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
