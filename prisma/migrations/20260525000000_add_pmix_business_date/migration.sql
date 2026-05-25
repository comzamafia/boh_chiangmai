-- AddColumn: businessDate (actual date of sales) to pmix_uploads
-- Allows calendar-based lookup and range analytics across multiple uploads

ALTER TABLE "pmix_uploads" ADD COLUMN "businessDate" DATE;

-- Index for efficient date-range queries
CREATE INDEX "pmix_uploads_businessDate_idx" ON "pmix_uploads"("businessDate");
