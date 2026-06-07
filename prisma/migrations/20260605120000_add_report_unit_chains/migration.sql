-- Per-ingredient flexible unit chain for the Usage Report.
CREATE TABLE "report_unit_chains" (
    "id"           TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "base"         TEXT NOT NULL,
    "relations"    JSONB NOT NULL,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_unit_chains_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "report_unit_chains_ingredientId_key" ON "report_unit_chains"("ingredientId");
ALTER TABLE "report_unit_chains" ADD CONSTRAINT "report_unit_chains_ingredientId_fkey"
  FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
