-- Phase 3: Set branchId NOT NULL + add composite unique constraints
-- ONLY run this AFTER scripts/migrate-multi-branch.ts has backfilled all rows.
--
-- Pre-check (run manually first):
--   SELECT 'suppliers' as t, count(*) FROM suppliers WHERE "branchId" IS NULL
--   UNION ALL SELECT 'ingredients', count(*) FROM ingredients WHERE "branchId" IS NULL
--   ... (repeat for all tables)
-- ALL counts must be 0 before applying this migration.

-- ══════════════════════════════════════════════════════════════════════
-- Set NOT NULL on all tables
-- ══════════════════════════════════════════════════════════════════════
ALTER TABLE "suppliers" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "ingredients" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "equipment" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "recipe_categories" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "user_recipe_category_permissions" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "recipes" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "recipe_ingredients" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "purchase_history" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "purchase_orders" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "purchase_order_items" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "production_schedules" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "prep_stations" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "prep_task_templates" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "prep_board_tasks" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "prep_activity_logs" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "prep_tasks" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "batch_plans" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "batch_plan_items" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "sales_entries" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "inventory_items" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "inventory_transactions" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "storage_areas" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "storage_area_watchers" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "notification_logs" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "ingredient_suppliers" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "portion_standards" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "pmix_uploads" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "pmix_items" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "pmix_modifiers" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "pmix_item_rules" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "ingredient_categories" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "user_category_permissions" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "report_stations" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "report_station_menus" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "storage_area_counts" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "report_unit_chains" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "loss_uploads" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "loss_complaints" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "loss_discounts" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "loss_reason_map" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "server_sales_uploads" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "server_sales_rows" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "composite_recipes" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "composite_components" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "menu_composite_links" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "protein_groups" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "protein_group_members" ALTER COLUMN "branchId" SET NOT NULL;

-- ══════════════════════════════════════════════════════════════════════
-- Drop old unique constraints and create composite ones with branchId
-- ══════════════════════════════════════════════════════════════════════

-- Ingredient.sku
DROP INDEX IF EXISTS "ingredients_sku_key";
CREATE UNIQUE INDEX "ingredients_sku_branchId_key" ON "ingredients"("sku", "branchId") WHERE "sku" IS NOT NULL;

-- RecipeCategory.name
DROP INDEX IF EXISTS "recipe_categories_name_key";
CREATE UNIQUE INDEX "recipe_categories_name_branchId_key" ON "recipe_categories"("name", "branchId");

-- PurchaseOrder.poNumber
DROP INDEX IF EXISTS "purchase_orders_poNumber_key";
CREATE UNIQUE INDEX "purchase_orders_poNumber_branchId_key" ON "purchase_orders"("poNumber", "branchId");

-- StorageArea.name
DROP INDEX IF EXISTS "storage_areas_name_key";
CREATE UNIQUE INDEX "storage_areas_name_branchId_key" ON "storage_areas"("name", "branchId");

-- NotificationLog.dedupeKey
DROP INDEX IF EXISTS "notification_logs_dedupeKey_key";
CREATE UNIQUE INDEX "notification_logs_dedupeKey_branchId_key" ON "notification_logs"("dedupeKey", "branchId");

-- ReportUnitChain.reportKey
DROP INDEX IF EXISTS "report_unit_chains_reportKey_key";
CREATE UNIQUE INDEX "report_unit_chains_reportKey_branchId_key" ON "report_unit_chains"("reportKey", "branchId") WHERE "reportKey" IS NOT NULL;

-- LossUpload.businessDate
DROP INDEX IF EXISTS "loss_uploads_businessDate_key";
CREATE UNIQUE INDEX "loss_uploads_businessDate_branchId_key" ON "loss_uploads"("businessDate", "branchId");

-- ServerSalesUpload.businessDate
DROP INDEX IF EXISTS "server_sales_uploads_businessDate_key";
CREATE UNIQUE INDEX "server_sales_uploads_businessDate_branchId_key" ON "server_sales_uploads"("businessDate", "branchId");

-- CompositeRecipe.name
DROP INDEX IF EXISTS "composite_recipes_name_key";
CREATE UNIQUE INDEX "composite_recipes_name_branchId_key" ON "composite_recipes"("name", "branchId");

-- ProteinGroup.name
DROP INDEX IF EXISTS "protein_groups_name_key";
CREATE UNIQUE INDEX "protein_groups_name_branchId_key" ON "protein_groups"("name", "branchId");

-- IngredientCategory.name
DROP INDEX IF EXISTS "ingredient_categories_name_key";
CREATE UNIQUE INDEX "ingredient_categories_name_branchId_key" ON "ingredient_categories"("name", "branchId");

-- InventoryItem.ingredientId — kept as a single-column unique. Each ingredient
-- row is branch-specific (distinct id per branch), so ingredientId is already
-- globally unique; a composite would also break Prisma's 1:1 relation requirement.
