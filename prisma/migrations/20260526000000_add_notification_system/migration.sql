-- ── Email Notification System ─────────────────────────────────────────────────
-- Adds storage-area-based email alert routing, watchers, and a send log.

-- 1. User: add JSON column for per-user notification prefs
ALTER TABLE "users" ADD COLUMN "notificationPrefs" JSONB;

-- 2. StorageArea: add routing columns
ALTER TABLE "storage_areas"
    ADD COLUMN "notifyEnabled"   BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN "alertThreshold"  TEXT    NOT NULL DEFAULT 'reorder',
    ADD COLUMN "digestSchedule"  TEXT    NOT NULL DEFAULT 'daily',
    ADD COLUMN "digestHourLocal" INTEGER NOT NULL DEFAULT 8,
    ADD COLUMN "digestDayOfWeek" INTEGER;

-- 3. StorageAreaWatcher (many-to-many: area ↔ user)
CREATE TABLE "storage_area_watchers" (
    "id"             TEXT NOT NULL,
    "storageAreaId"  TEXT NOT NULL,
    "userId"         TEXT NOT NULL,
    "role"           TEXT NOT NULL DEFAULT 'watcher',
    "alertThreshold" TEXT,
    "digestSchedule" TEXT,
    "ccOnly"         BOOLEAN NOT NULL DEFAULT false,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "storage_area_watchers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "storage_area_watchers_storageAreaId_userId_key"
    ON "storage_area_watchers"("storageAreaId", "userId");
CREATE INDEX "storage_area_watchers_userId_idx"
    ON "storage_area_watchers"("userId");

ALTER TABLE "storage_area_watchers"
    ADD CONSTRAINT "storage_area_watchers_storageAreaId_fkey"
    FOREIGN KEY ("storageAreaId") REFERENCES "storage_areas"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "storage_area_watchers"
    ADD CONSTRAINT "storage_area_watchers_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. NotificationLog (dedupe + audit)
CREATE TABLE "notification_logs" (
    "id"            TEXT NOT NULL,
    "type"          TEXT NOT NULL,
    "storageAreaId" TEXT,
    "ingredientId"  TEXT,
    "userId"        TEXT,
    "email"         TEXT NOT NULL,
    "subject"       TEXT NOT NULL,
    "status"        TEXT NOT NULL,
    "errorMsg"      TEXT,
    "dedupeKey"     TEXT NOT NULL,
    "sentAt"        TIMESTAMP(3),
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notification_logs_dedupeKey_key"
    ON "notification_logs"("dedupeKey");
CREATE INDEX "notification_logs_type_createdAt_idx"
    ON "notification_logs"("type", "createdAt");
CREATE INDEX "notification_logs_storageAreaId_idx"
    ON "notification_logs"("storageAreaId");
CREATE INDEX "notification_logs_userId_idx"
    ON "notification_logs"("userId");
