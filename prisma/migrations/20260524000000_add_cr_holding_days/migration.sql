-- CR: Add holdingDays to InventoryItem for per-ingredient PAR Max calculation
-- Idempotent — safe to re-run

ALTER TABLE "inventory_items" ADD COLUMN IF NOT EXISTS "holdingDays" INTEGER NOT NULL DEFAULT 7;
