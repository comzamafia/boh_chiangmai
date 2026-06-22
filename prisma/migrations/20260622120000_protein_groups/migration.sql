-- Usage Report: protein display groups for the Main Protein tab.
-- A protein group (e.g. "Chicken", "CM Wings") consolidates one or more real
-- ingredients under a single display name + sort order. Usage is still computed
-- by the ingredient roll-up; groups only fold/label/order it for display.

CREATE TABLE "protein_groups" (
    "id"        TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "protein_groups_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "protein_groups_name_key" ON "protein_groups"("name");

CREATE TABLE "protein_group_members" (
    "id"           TEXT NOT NULL,
    "groupId"      TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    CONSTRAINT "protein_group_members_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "protein_group_members_groupId_ingredientId_key" ON "protein_group_members"("groupId", "ingredientId");
CREATE INDEX "protein_group_members_groupId_idx" ON "protein_group_members"("groupId");
CREATE INDEX "protein_group_members_ingredientId_idx" ON "protein_group_members"("ingredientId");

ALTER TABLE "protein_group_members"
    ADD CONSTRAINT "protein_group_members_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "protein_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "protein_group_members"
    ADD CONSTRAINT "protein_group_members_ingredientId_fkey"
    FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
