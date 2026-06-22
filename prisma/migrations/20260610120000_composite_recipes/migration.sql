-- Usage Report: reusable composite sub-recipes + menu links.
-- A composite (e.g. "Curry Sauce") yields N units and is made of several real
-- ingredients; menu items reference it via menu_composite_links. Raw per-menu
-- ingredient components stay in portion_standards (unchanged).

CREATE TABLE "composite_recipes" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "yieldQty"  DECIMAL(10,4) NOT NULL,
    "yieldUnit" TEXT NOT NULL,
    "notes"     TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "composite_recipes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "composite_recipes_name_key" ON "composite_recipes"("name");

CREATE TABLE "composite_components" (
    "id"           TEXT NOT NULL,
    "compositeId"  TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "qty"          DECIMAL(10,4) NOT NULL,
    "unit"         TEXT NOT NULL,
    CONSTRAINT "composite_components_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "composite_components_compositeId_idx" ON "composite_components"("compositeId");
CREATE INDEX "composite_components_ingredientId_idx" ON "composite_components"("ingredientId");

CREATE TABLE "menu_composite_links" (
    "id"          TEXT NOT NULL,
    "itemName"    TEXT NOT NULL,
    "compositeId" TEXT NOT NULL,
    "qty"         DECIMAL(10,4) NOT NULL,
    "unit"        TEXT NOT NULL,
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "menu_composite_links_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "menu_composite_links_itemName_idx" ON "menu_composite_links"("itemName");
CREATE INDEX "menu_composite_links_compositeId_idx" ON "menu_composite_links"("compositeId");

ALTER TABLE "composite_components"
    ADD CONSTRAINT "composite_components_compositeId_fkey"
    FOREIGN KEY ("compositeId") REFERENCES "composite_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "composite_components"
    ADD CONSTRAINT "composite_components_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "menu_composite_links"
    ADD CONSTRAINT "menu_composite_links_compositeId_fkey"
    FOREIGN KEY ("compositeId") REFERENCES "composite_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
