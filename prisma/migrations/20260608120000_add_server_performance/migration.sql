-- Server Performance (Admin-only)
CREATE TABLE "server_sales_uploads" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "serverCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_sales_uploads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "server_sales_uploads_businessDate_key" ON "server_sales_uploads"("businessDate");

CREATE TABLE "server_sales_rows" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "staffName" TEXT NOT NULL,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "shiftHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "chargeTips" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gratuity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceFees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avgPerGuest" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avgPerOrder" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "foodSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "foodCount" INTEGER NOT NULL DEFAULT 0,
    "beverageSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "beverageCount" INTEGER NOT NULL DEFAULT 0,
    "alcoholSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "alcoholCount" INTEGER NOT NULL DEFAULT 0,
    "dessertSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dessertCount" INTEGER NOT NULL DEFAULT 0,
    "otherSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "server_sales_rows_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "server_sales_rows_businessDate_idx" ON "server_sales_rows"("businessDate");
