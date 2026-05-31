-- Food Cost Variance: capture (counted − expected) at each physical count so
-- shrinkage / over-portioning can be aggregated and valued.
ALTER TABLE "inventory_transactions"
  ADD COLUMN "varianceQty" DECIMAL(10,4);
