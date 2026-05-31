-- Master Prep List: persist daily prep tasks per station (was UI-only mock).
CREATE TABLE "prep_tasks" (
    "id"        TEXT NOT NULL,
    "date"      TEXT NOT NULL,
    "station"   TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "qty"       TEXT,
    "dueTime"   TEXT,
    "done"      BOOLEAN NOT NULL DEFAULT false,
    "doneBy"    TEXT,
    "doneAt"    TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prep_tasks_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prep_tasks_date_idx" ON "prep_tasks"("date");
