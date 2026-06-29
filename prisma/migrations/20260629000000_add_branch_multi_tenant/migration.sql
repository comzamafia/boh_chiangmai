-- CreateTable: branches
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "address" TEXT,
    "phone" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "logoUrl" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'America/Toronto',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_slug_key" ON "branches"("slug");

-- CreateTable: user_branches
CREATE TABLE "user_branches" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "user_branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_branches_userId_idx" ON "user_branches"("userId");
CREATE INDEX "user_branches_branchId_idx" ON "user_branches"("branchId");
CREATE UNIQUE INDEX "user_branches_userId_branchId_key" ON "user_branches"("userId", "branchId");

-- AddForeignKey
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_branches" ADD CONSTRAINT "user_branches_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add nullable branchId to ALL data tables
ALTER TABLE "suppliers" ADD COLUMN "branchId" TEXT;
ALTER TABLE "ingredients" ADD COLUMN "branchId" TEXT;
ALTER TABLE "equipment" ADD COLUMN "branchId" TEXT;
ALTER TABLE "recipe_categories" ADD COLUMN "branchId" TEXT;
ALTER TABLE "user_recipe_category_permissions" ADD COLUMN "branchId" TEXT;
ALTER TABLE "recipes" ADD COLUMN "branchId" TEXT;
ALTER TABLE "recipe_ingredients" ADD COLUMN "branchId" TEXT;
ALTER TABLE "purchase_history" ADD COLUMN "branchId" TEXT;
ALTER TABLE "purchase_orders" ADD COLUMN "branchId" TEXT;
ALTER TABLE "purchase_order_items" ADD COLUMN "branchId" TEXT;
ALTER TABLE "production_schedules" ADD COLUMN "branchId" TEXT;
ALTER TABLE "prep_stations" ADD COLUMN "branchId" TEXT;
ALTER TABLE "prep_task_templates" ADD COLUMN "branchId" TEXT;
ALTER TABLE "prep_board_tasks" ADD COLUMN "branchId" TEXT;
ALTER TABLE "prep_activity_logs" ADD COLUMN "branchId" TEXT;
ALTER TABLE "prep_tasks" ADD COLUMN "branchId" TEXT;
ALTER TABLE "batch_plans" ADD COLUMN "branchId" TEXT;
ALTER TABLE "batch_plan_items" ADD COLUMN "branchId" TEXT;
ALTER TABLE "sales_entries" ADD COLUMN "branchId" TEXT;
ALTER TABLE "inventory_items" ADD COLUMN "branchId" TEXT;
ALTER TABLE "inventory_transactions" ADD COLUMN "branchId" TEXT;
ALTER TABLE "storage_areas" ADD COLUMN "branchId" TEXT;
ALTER TABLE "storage_area_watchers" ADD COLUMN "branchId" TEXT;
ALTER TABLE "notification_logs" ADD COLUMN "branchId" TEXT;
ALTER TABLE "ingredient_suppliers" ADD COLUMN "branchId" TEXT;
ALTER TABLE "portion_standards" ADD COLUMN "branchId" TEXT;
ALTER TABLE "pmix_uploads" ADD COLUMN "branchId" TEXT;
ALTER TABLE "pmix_items" ADD COLUMN "branchId" TEXT;
ALTER TABLE "pmix_modifiers" ADD COLUMN "branchId" TEXT;
ALTER TABLE "pmix_item_rules" ADD COLUMN "branchId" TEXT;
ALTER TABLE "ingredient_categories" ADD COLUMN "branchId" TEXT;
ALTER TABLE "user_category_permissions" ADD COLUMN "branchId" TEXT;
ALTER TABLE "audit_logs" ADD COLUMN "branchId" TEXT;
ALTER TABLE "report_stations" ADD COLUMN "branchId" TEXT;
ALTER TABLE "report_station_menus" ADD COLUMN "branchId" TEXT;
ALTER TABLE "storage_area_counts" ADD COLUMN "branchId" TEXT;
ALTER TABLE "report_unit_chains" ADD COLUMN "branchId" TEXT;
ALTER TABLE "loss_uploads" ADD COLUMN "branchId" TEXT;
ALTER TABLE "loss_complaints" ADD COLUMN "branchId" TEXT;
ALTER TABLE "loss_discounts" ADD COLUMN "branchId" TEXT;
ALTER TABLE "loss_reason_map" ADD COLUMN "branchId" TEXT;
ALTER TABLE "server_sales_uploads" ADD COLUMN "branchId" TEXT;
ALTER TABLE "server_sales_rows" ADD COLUMN "branchId" TEXT;
ALTER TABLE "composite_recipes" ADD COLUMN "branchId" TEXT;
ALTER TABLE "composite_components" ADD COLUMN "branchId" TEXT;
ALTER TABLE "menu_composite_links" ADD COLUMN "branchId" TEXT;
ALTER TABLE "protein_groups" ADD COLUMN "branchId" TEXT;
ALTER TABLE "protein_group_members" ADD COLUMN "branchId" TEXT;

-- Add branchId indexes on all tables
CREATE INDEX "suppliers_branchId_idx" ON "suppliers"("branchId");
CREATE INDEX "ingredients_branchId_idx" ON "ingredients"("branchId");
CREATE INDEX "equipment_branchId_idx" ON "equipment"("branchId");
CREATE INDEX "recipe_categories_branchId_idx" ON "recipe_categories"("branchId");
CREATE INDEX "user_recipe_category_permissions_branchId_idx" ON "user_recipe_category_permissions"("branchId");
CREATE INDEX "recipes_branchId_idx" ON "recipes"("branchId");
CREATE INDEX "recipe_ingredients_branchId_idx" ON "recipe_ingredients"("branchId");
CREATE INDEX "purchase_history_branchId_idx" ON "purchase_history"("branchId");
CREATE INDEX "purchase_orders_branchId_idx" ON "purchase_orders"("branchId");
CREATE INDEX "purchase_order_items_branchId_idx" ON "purchase_order_items"("branchId");
CREATE INDEX "production_schedules_branchId_idx" ON "production_schedules"("branchId");
CREATE INDEX "prep_stations_branchId_idx" ON "prep_stations"("branchId");
CREATE INDEX "prep_task_templates_branchId_idx" ON "prep_task_templates"("branchId");
CREATE INDEX "prep_board_tasks_branchId_idx" ON "prep_board_tasks"("branchId");
CREATE INDEX "prep_activity_logs_branchId_idx" ON "prep_activity_logs"("branchId");
CREATE INDEX "prep_tasks_branchId_idx" ON "prep_tasks"("branchId");
CREATE INDEX "batch_plans_branchId_idx" ON "batch_plans"("branchId");
CREATE INDEX "batch_plan_items_branchId_idx" ON "batch_plan_items"("branchId");
CREATE INDEX "sales_entries_branchId_idx" ON "sales_entries"("branchId");
CREATE INDEX "inventory_items_branchId_idx" ON "inventory_items"("branchId");
CREATE INDEX "inventory_transactions_branchId_idx" ON "inventory_transactions"("branchId");
CREATE INDEX "storage_areas_branchId_idx" ON "storage_areas"("branchId");
CREATE INDEX "storage_area_watchers_branchId_idx" ON "storage_area_watchers"("branchId");
CREATE INDEX "notification_logs_branchId_idx" ON "notification_logs"("branchId");
CREATE INDEX "ingredient_suppliers_branchId_idx" ON "ingredient_suppliers"("branchId");
CREATE INDEX "portion_standards_branchId_idx" ON "portion_standards"("branchId");
CREATE INDEX "pmix_uploads_branchId_idx" ON "pmix_uploads"("branchId");
CREATE INDEX "pmix_items_branchId_idx" ON "pmix_items"("branchId");
CREATE INDEX "pmix_modifiers_branchId_idx" ON "pmix_modifiers"("branchId");
CREATE INDEX "pmix_item_rules_branchId_idx" ON "pmix_item_rules"("branchId");
CREATE INDEX "ingredient_categories_branchId_idx" ON "ingredient_categories"("branchId");
CREATE INDEX "user_category_permissions_branchId_idx" ON "user_category_permissions"("branchId");
CREATE INDEX "audit_logs_branchId_idx" ON "audit_logs"("branchId");
CREATE INDEX "report_stations_branchId_idx" ON "report_stations"("branchId");
CREATE INDEX "report_station_menus_branchId_idx" ON "report_station_menus"("branchId");
CREATE INDEX "storage_area_counts_branchId_idx" ON "storage_area_counts"("branchId");
CREATE INDEX "report_unit_chains_branchId_idx" ON "report_unit_chains"("branchId");
CREATE INDEX "loss_uploads_branchId_idx" ON "loss_uploads"("branchId");
CREATE INDEX "loss_complaints_branchId_idx" ON "loss_complaints"("branchId");
CREATE INDEX "loss_discounts_branchId_idx" ON "loss_discounts"("branchId");
CREATE INDEX "loss_reason_map_branchId_idx" ON "loss_reason_map"("branchId");
CREATE INDEX "server_sales_uploads_branchId_idx" ON "server_sales_uploads"("branchId");
CREATE INDEX "server_sales_rows_branchId_idx" ON "server_sales_rows"("branchId");
CREATE INDEX "composite_recipes_branchId_idx" ON "composite_recipes"("branchId");
CREATE INDEX "composite_components_branchId_idx" ON "composite_components"("branchId");
CREATE INDEX "menu_composite_links_branchId_idx" ON "menu_composite_links"("branchId");
CREATE INDEX "protein_groups_branchId_idx" ON "protein_groups"("branchId");
CREATE INDEX "protein_group_members_branchId_idx" ON "protein_group_members"("branchId");

-- Add foreign keys for branchId on all tables
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipe_categories" ADD CONSTRAINT "recipe_categories_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_recipe_category_permissions" ADD CONSTRAINT "user_recipe_category_permissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_history" ADD CONSTRAINT "purchase_history_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "production_schedules" ADD CONSTRAINT "production_schedules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_stations" ADD CONSTRAINT "prep_stations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_task_templates" ADD CONSTRAINT "prep_task_templates_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_board_tasks" ADD CONSTRAINT "prep_board_tasks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_activity_logs" ADD CONSTRAINT "prep_activity_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "prep_tasks" ADD CONSTRAINT "prep_tasks_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "batch_plans" ADD CONSTRAINT "batch_plans_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "batch_plan_items" ADD CONSTRAINT "batch_plan_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "storage_areas" ADD CONSTRAINT "storage_areas_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "storage_area_watchers" ADD CONSTRAINT "storage_area_watchers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "notification_logs" ADD CONSTRAINT "notification_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "portion_standards" ADD CONSTRAINT "portion_standards_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pmix_uploads" ADD CONSTRAINT "pmix_uploads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pmix_items" ADD CONSTRAINT "pmix_items_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pmix_modifiers" ADD CONSTRAINT "pmix_modifiers_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pmix_item_rules" ADD CONSTRAINT "pmix_item_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ingredient_categories" ADD CONSTRAINT "ingredient_categories_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "user_category_permissions" ADD CONSTRAINT "user_category_permissions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_stations" ADD CONSTRAINT "report_stations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_station_menus" ADD CONSTRAINT "report_station_menus_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "storage_area_counts" ADD CONSTRAINT "storage_area_counts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "report_unit_chains" ADD CONSTRAINT "report_unit_chains_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loss_uploads" ADD CONSTRAINT "loss_uploads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loss_complaints" ADD CONSTRAINT "loss_complaints_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loss_discounts" ADD CONSTRAINT "loss_discounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "loss_reason_map" ADD CONSTRAINT "loss_reason_map_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "server_sales_uploads" ADD CONSTRAINT "server_sales_uploads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "server_sales_rows" ADD CONSTRAINT "server_sales_rows_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_recipes" ADD CONSTRAINT "composite_recipes_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "composite_components" ADD CONSTRAINT "composite_components_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "menu_composite_links" ADD CONSTRAINT "menu_composite_links_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "protein_groups" ADD CONSTRAINT "protein_groups_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "protein_group_members" ADD CONSTRAINT "protein_group_members_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
