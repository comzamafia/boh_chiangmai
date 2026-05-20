-- CreateTable: user_recipe_category_permissions
CREATE TABLE IF NOT EXISTS "user_recipe_category_permissions" (
    "id"         TEXT NOT NULL,
    "userId"     TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_recipe_category_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "user_recipe_category_permissions_userId_categoryId_key"
    ON "user_recipe_category_permissions"("userId", "categoryId");

-- AddForeignKey: → users
ALTER TABLE "user_recipe_category_permissions"
    DROP CONSTRAINT IF EXISTS "user_recipe_category_permissions_userId_fkey";
ALTER TABLE "user_recipe_category_permissions"
    ADD CONSTRAINT "user_recipe_category_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: → recipe_categories
ALTER TABLE "user_recipe_category_permissions"
    DROP CONSTRAINT IF EXISTS "user_recipe_category_permissions_categoryId_fkey";
ALTER TABLE "user_recipe_category_permissions"
    ADD CONSTRAINT "user_recipe_category_permissions_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "recipe_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
