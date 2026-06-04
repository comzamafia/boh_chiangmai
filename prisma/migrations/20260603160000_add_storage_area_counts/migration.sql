-- Per-storage-area physical counts (same ingredient can live in several areas).
CREATE TABLE "storage_area_counts" (
    "id"            TEXT NOT NULL,
    "ingredientId"  TEXT NOT NULL,
    "storageAreaId" TEXT NOT NULL,
    "recipeQty"     DECIMAL(12,4) NOT NULL,
    "countedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_area_counts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "storage_area_counts_ingredientId_storageAreaId_key" ON "storage_area_counts"("ingredientId", "storageAreaId");
CREATE INDEX "storage_area_counts_storageAreaId_idx" ON "storage_area_counts"("storageAreaId");
