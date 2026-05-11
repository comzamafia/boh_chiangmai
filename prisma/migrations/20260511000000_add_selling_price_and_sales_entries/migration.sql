-- AlterTable: add selling price to recipes (nullable)
ALTER TABLE "recipes" ADD COLUMN "sellingPrice" DECIMAL(10,2);

-- CreateTable: sales_entries
CREATE TABLE "sales_entries" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "revenue" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_entries_date_idx" ON "sales_entries"("date");

-- AddForeignKey
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
