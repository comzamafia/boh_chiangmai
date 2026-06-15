-- Unit chains become per report item (category::label) instead of per ingredient,
-- so e.g. "Panang Curry" and "Chicken" no longer share one chain.
ALTER TABLE "report_unit_chains" ADD COLUMN "reportKey" TEXT;
ALTER TABLE "report_unit_chains" ALTER COLUMN "ingredientId" DROP NOT NULL;
ALTER TABLE "report_unit_chains" DROP CONSTRAINT IF EXISTS "report_unit_chains_ingredientId_fkey";
DROP INDEX IF EXISTS "report_unit_chains_ingredientId_key";
CREATE UNIQUE INDEX "report_unit_chains_reportKey_key" ON "report_unit_chains"("reportKey");
-- Old ingredient-keyed chains were shared/ambiguous; clear them so each item starts clean.
DELETE FROM "report_unit_chains" WHERE "reportKey" IS NULL;
