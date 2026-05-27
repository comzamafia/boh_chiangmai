-- ── Supplier delivery schedule for lead-time-driven PAR calculations ─────────
-- Adds 6 columns to suppliers so we know:
--   • which weekdays they deliver
--   • by when an order must be placed (cutoff time + day offset)
--   • their minimum order value
--   • any free-text delivery notes

ALTER TABLE "suppliers"
    ADD COLUMN "deliveryDays"         INTEGER[]      NOT NULL DEFAULT ARRAY[]::INTEGER[],
    ADD COLUMN "orderCutoffTime"      TEXT,
    ADD COLUMN "orderCutoffDayOffset" INTEGER        NOT NULL DEFAULT 1,
    ADD COLUMN "deliveryTimeWindow"   TEXT,
    ADD COLUMN "minOrderValue"        DECIMAL(10, 2),
    ADD COLUMN "deliveryNotes"        TEXT;
