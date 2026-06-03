-- Station Prep Report: stations that own PMIX menu assignments.
CREATE TABLE "report_stations" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "icon"      TEXT NOT NULL DEFAULT 'utensils',
    "color"     TEXT NOT NULL DEFAULT 'bg-slate-500',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "report_stations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_station_menus" (
    "id"        TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "itemName"  TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "report_station_menus_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_station_menus_stationId_itemName_key" ON "report_station_menus"("stationId", "itemName");
CREATE INDEX "report_station_menus_stationId_idx" ON "report_station_menus"("stationId");

ALTER TABLE "report_station_menus"
  ADD CONSTRAINT "report_station_menus_stationId_fkey"
  FOREIGN KEY ("stationId") REFERENCES "report_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
