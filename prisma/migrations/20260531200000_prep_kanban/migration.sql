-- Prep Station Kanban: master Task List (templates) + daily board + activity log.

ALTER TABLE "prep_stations" ADD COLUMN "memberIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE "prep_task_templates" (
    "id"        TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "qty"       TEXT,
    "dueTime"   TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prep_task_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prep_task_templates_stationId_idx" ON "prep_task_templates"("stationId");
ALTER TABLE "prep_task_templates"
  ADD CONSTRAINT "prep_task_templates_stationId_fkey"
  FOREIGN KEY ("stationId") REFERENCES "prep_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prep_board_tasks" (
    "id"          TEXT NOT NULL,
    "date"        TEXT NOT NULL,
    "stationId"   TEXT NOT NULL,
    "templateId"  TEXT NOT NULL,
    "status"      TEXT NOT NULL DEFAULT 'todo',
    "todoAt"      TIMESTAMP(3),
    "todoBy"      TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "prep_board_tasks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "prep_board_tasks_date_templateId_key" ON "prep_board_tasks"("date","templateId");
CREATE INDEX "prep_board_tasks_date_stationId_idx" ON "prep_board_tasks"("date","stationId");
ALTER TABLE "prep_board_tasks"
  ADD CONSTRAINT "prep_board_tasks_templateId_fkey"
  FOREIGN KEY ("templateId") REFERENCES "prep_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "prep_activity_logs" (
    "id"          TEXT NOT NULL,
    "date"        TEXT NOT NULL,
    "stationId"   TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "templateId"  TEXT,
    "taskName"    TEXT NOT NULL,
    "action"      TEXT NOT NULL,
    "userId"      TEXT,
    "userName"    TEXT,
    "at"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "prep_activity_logs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "prep_activity_logs_date_idx"   ON "prep_activity_logs"("date");
CREATE INDEX "prep_activity_logs_action_idx" ON "prep_activity_logs"("action");
CREATE INDEX "prep_activity_logs_userId_idx" ON "prep_activity_logs"("userId");

-- Seed templates from any existing daily checklist tasks (distinct name per station)
INSERT INTO "prep_task_templates" ("id","stationId","name","sortOrder","active","createdAt","updatedAt")
SELECT gen_random_uuid()::text, ps.id, d.name, 0, true, now(), now()
FROM (SELECT DISTINCT station, name FROM "prep_tasks") d
JOIN "prep_stations" ps ON ps.name = d.station;
