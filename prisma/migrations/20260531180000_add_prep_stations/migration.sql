-- Prep stations become editable (create / rename) instead of hard-coded.
CREATE TABLE "prep_stations" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "icon"      TEXT NOT NULL DEFAULT 'utensils',
    "color"     TEXT NOT NULL DEFAULT 'bg-slate-500',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prep_stations_pkey" PRIMARY KEY ("id")
);

-- Seed the original four stations so existing prep tasks keep their grouping.
INSERT INTO "prep_stations" ("id","name","icon","color","sortOrder","updatedAt") VALUES
  ('seed_prep',  'Prep Station',  'utensils',    'bg-orange-500', 0, CURRENT_TIMESTAMP),
  ('seed_sauce', 'Sauce Station', 'droplets',    'bg-blue-500',   1, CURRENT_TIMESTAMP),
  ('seed_hot',   'Hot Station',   'flame',       'bg-red-500',    2, CURRENT_TIMESTAMP),
  ('seed_cold',  'Cold Station',  'thermometer', 'bg-cyan-500',   3, CURRENT_TIMESTAMP);

-- Existing tasks stored the short station key ("Prep"); remap to full names
-- so they stay grouped under the seeded stations.
UPDATE "prep_tasks" SET "station" = 'Prep Station'  WHERE "station" = 'Prep';
UPDATE "prep_tasks" SET "station" = 'Sauce Station' WHERE "station" = 'Sauce';
UPDATE "prep_tasks" SET "station" = 'Hot Station'   WHERE "station" = 'Hot';
UPDATE "prep_tasks" SET "station" = 'Cold Station'  WHERE "station" = 'Cold';
