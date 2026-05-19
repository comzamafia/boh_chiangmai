-- Add Sub Recipe fields to recipes table
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "isSubRecipe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "linkedIngredientId" TEXT;
