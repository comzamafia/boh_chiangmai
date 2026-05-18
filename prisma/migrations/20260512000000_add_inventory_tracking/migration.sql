-- CreateTable: inventory_items
CREATE TABLE IF NOT EXISTS "inventory_items" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentStock" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "parMin" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "parMax" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "reorderPoint" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "lastCountDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable: inventory_transactions
CREATE TABLE IF NOT EXISTS "inventory_transactions" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "costPerUnit" DECIMAL(12,4),
    "reason" TEXT,
    "note" TEXT,
    "date" TEXT NOT NULL,
    "recipeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "inventory_items_ingredientId_key" ON "inventory_items"("ingredientId");
CREATE INDEX IF NOT EXISTS "inventory_transactions_ingredientId_idx" ON "inventory_transactions"("ingredientId");
CREATE INDEX IF NOT EXISTS "inventory_transactions_date_idx" ON "inventory_transactions"("date");

-- AddForeignKey
ALTER TABLE "inventory_items" DROP CONSTRAINT IF EXISTS "inventory_items_ingredientId_fkey";
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_transactions" DROP CONSTRAINT IF EXISTS "inventory_transactions_inventoryItemId_fkey";
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventoryItemId_fkey"
    FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "inventory_transactions" DROP CONSTRAINT IF EXISTS "inventory_transactions_ingredientId_fkey";
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
