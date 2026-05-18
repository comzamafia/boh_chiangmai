-- AlterTable: add categoryId to ingredients (nullable, safe for existing rows)
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;

-- AlterTable: add department to users (nullable, safe for existing rows)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "department" TEXT;

-- CreateTable: ingredient_categories
CREATE TABLE IF NOT EXISTS "ingredient_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable: user_category_permissions
CREATE TABLE IF NOT EXISTS "user_category_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_category_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable: audit_logs
CREATE TABLE IF NOT EXISTS "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "userEmail" TEXT,
    "userRole" TEXT,
    "action" TEXT NOT NULL,
    "targetTable" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetName" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "ingredient_categories_name_key" ON "ingredient_categories"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "user_category_permissions_userId_categoryId_key" ON "user_category_permissions"("userId", "categoryId");
CREATE INDEX IF NOT EXISTS "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX IF NOT EXISTS "audit_logs_targetTable_idx" ON "audit_logs"("targetTable");
CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- AddForeignKey: ingredients → ingredient_categories
ALTER TABLE "ingredients" DROP CONSTRAINT IF EXISTS "ingredients_categoryId_fkey";
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: user_category_permissions → users
ALTER TABLE "user_category_permissions" DROP CONSTRAINT IF EXISTS "user_category_permissions_userId_fkey";
ALTER TABLE "user_category_permissions" ADD CONSTRAINT "user_category_permissions_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: user_category_permissions → ingredient_categories
ALTER TABLE "user_category_permissions" DROP CONSTRAINT IF EXISTS "user_category_permissions_categoryId_fkey";
ALTER TABLE "user_category_permissions" ADD CONSTRAINT "user_category_permissions_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: audit_logs → users (nullable, SetNull on delete)
ALTER TABLE "audit_logs" DROP CONSTRAINT IF EXISTS "audit_logs_userId_fkey";
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
