-- Editable reason normaliser for Loss Management.
CREATE TABLE "loss_reason_map" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "loss_reason_map_pkey" PRIMARY KEY ("id")
);
