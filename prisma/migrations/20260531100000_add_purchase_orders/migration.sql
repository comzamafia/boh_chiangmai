-- Purchase Orders moved from browser localStorage into the database, so they
-- are persistent, shared across devices/users, auditable, and can drive
-- receiving reconciliation later.

CREATE TABLE "purchase_orders" (
    "id"           TEXT NOT NULL,
    "poNumber"     TEXT NOT NULL,
    "supplierId"   TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status"       TEXT NOT NULL DEFAULT 'Draft',
    "orderDate"    TEXT NOT NULL,
    "deliveryDate" TEXT,
    "notes"        TEXT,
    "grandTotal"   DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "purchase_order_items" (
    "id"              TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId"    TEXT,
    "ingredientName"  TEXT NOT NULL,
    "qty"             DECIMAL(10,4) NOT NULL,
    "unit"            TEXT NOT NULL,
    "unitPrice"       DECIMAL(10,2) NOT NULL,
    "total"           DECIMAL(12,2) NOT NULL,
    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

ALTER TABLE "purchase_orders"
  ADD CONSTRAINT "purchase_orders_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "purchase_order_items"
  ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey"
  FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
