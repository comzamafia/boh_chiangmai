-- Portion Standards: BOM-free portion calculator
-- Maps POS menu item names / modifier names to ingredients with a portion size.
-- Idempotent — safe to re-run

CREATE TABLE IF NOT EXISTS "portion_standards" (
    "id"           TEXT           NOT NULL,
    "ingredientId" TEXT           NOT NULL,
    "itemName"     TEXT           NOT NULL,
    "type"         TEXT           NOT NULL DEFAULT 'base',
    "portionSize"  DECIMAL(10,4)  NOT NULL,
    "portionUnit"  TEXT           NOT NULL,
    "notes"        TEXT,
    "createdAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "portion_standards_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "portion_standards_ingredientId_idx" ON "portion_standards"("ingredientId");
CREATE INDEX IF NOT EXISTS "portion_standards_itemName_idx"     ON "portion_standards"("itemName");

ALTER TABLE "portion_standards" DROP CONSTRAINT IF EXISTS "portion_standards_ingredientId_fkey";
ALTER TABLE "portion_standards" ADD CONSTRAINT "portion_standards_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE;
