-- Loss Management (Admin-only)
CREATE TABLE "loss_uploads" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "discountCount" INTEGER NOT NULL DEFAULT 0,
    "hasComplaints" BOOLEAN NOT NULL DEFAULT false,
    "hasDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loss_uploads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "loss_uploads_businessDate_key" ON "loss_uploads"("businessDate");

CREATE TABLE "loss_complaints" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "isUnassignedUser" BOOLEAN NOT NULL DEFAULT false,
    "actionType" TEXT NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "isUndoReconciled" BOOLEAN NOT NULL DEFAULT false,
    "itemDetail" TEXT NOT NULL,
    "isGenericItem" BOOLEAN NOT NULL DEFAULT false,
    "reasonRaw" TEXT NOT NULL,
    "reasonCategory" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loss_complaints_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loss_complaints_businessDate_idx" ON "loss_complaints"("businessDate");

CREATE TABLE "loss_discounts" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "createTime" TIMESTAMP(3),
    "displayId" TEXT NOT NULL,
    "discountName" TEXT NOT NULL,
    "discountCategory" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 1,
    "authorizedBy" TEXT NOT NULL,
    "isAnonymousAuth" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" TEXT NOT NULL,
    "isBulkDiscount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loss_discounts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "loss_discounts_businessDate_idx" ON "loss_discounts"("businessDate");
