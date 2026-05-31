-- Receiving reconciliation: record the actual qty received per PO line so we
-- can compare ordered vs received (short/over deliveries).
ALTER TABLE "purchase_order_items"
  ADD COLUMN "receivedQty" DECIMAL(10,4);
