-- Physical Stock Count redesign: add a "pack / case" counting layer.
--
-- Staff count whole cases (ลัง) on the shelf, but the system only knew
-- purchaseUnit (lb) and recipeUnit (oz). These two columns let an inventory
-- item define how big one pack is, so counting "1 ลัง" auto-converts:
--   1 pack = packSize purchase units = packSize × conversionRate recipe units
--
-- Both columns are nullable — items without a pack just count in lb / oz.

ALTER TABLE "inventory_items"
  ADD COLUMN "packUnit" TEXT,
  ADD COLUMN "packSize" DECIMAL(10,4);
