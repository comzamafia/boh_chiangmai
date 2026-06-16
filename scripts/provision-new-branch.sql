-- Provision a NEW branch database from scratch (run once in Neon SQL Editor on an EMPTY DB).
-- Creates the full schema, then baselines _prisma_migrations so 'prisma migrate deploy'
-- treats every existing migration as already applied (the historical migrations are not
-- reproducible from empty). Safe to run on a freshly DROPped public schema.

-- ── 1. Full schema ─────────────────────────────────────────────────────────
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'staff',
    "permissions" TEXT[],
    "department" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notificationPrefs" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "contact" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "isSpecial" BOOLEAN NOT NULL DEFAULT false,
    "deliveryDays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "orderCutoffTime" TEXT,
    "orderCutoffDayOffset" INTEGER NOT NULL DEFAULT 1,
    "deliveryTimeWindow" TEXT,
    "minOrderValue" DECIMAL(10,2),
    "deliveryNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredients" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "supplierId" TEXT NOT NULL,
    "purchaseUnit" TEXT NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "recipeUnit" TEXT NOT NULL,
    "yieldPercent" DECIMAL(5,2) NOT NULL,
    "conversionRate" DECIMAL(10,4) NOT NULL,
    "groupId" TEXT NOT NULL,
    "categoryId" TEXT,
    "storageAreaId" TEXT,
    "averageCostPerBaseUnit" DECIMAL(10,6),
    "reportUnit" TEXT,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "equipment" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "equipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipe_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_recipe_category_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_recipe_category_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipes" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "yieldAmount" DECIMAL(10,2) NOT NULL,
    "yieldUnit" TEXT NOT NULL,
    "prepTime" INTEGER NOT NULL,
    "cookTime" INTEGER NOT NULL,
    "laborCostPerHour" DECIMAL(10,2) NOT NULL,
    "energyCostPerBatch" DECIMAL(10,2) NOT NULL,
    "sellingPrice" DECIMAL(10,2),
    "deliveryPrice" DECIMAL(10,2),
    "imageUrl" TEXT,
    "isMainSauce" BOOLEAN NOT NULL DEFAULT false,
    "isSubRecipe" BOOLEAN NOT NULL DEFAULT false,
    "linkedIngredientId" TEXT,
    "instructions" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recipes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recipe_ingredients" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "quantity" DECIMAL(10,4) NOT NULL,

    CONSTRAINT "recipe_ingredients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_history" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "supplierId" TEXT NOT NULL,
    "ingredient" TEXT NOT NULL,
    "qty" DECIMAL(10,2) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(10,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Draft',
    "orderDate" TEXT NOT NULL,
    "deliveryDate" TEXT,
    "notes" TEXT,
    "grandTotal" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_items" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "ingredientId" TEXT,
    "ingredientName" TEXT NOT NULL,
    "qty" DECIMAL(10,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "total" DECIMAL(12,2) NOT NULL,
    "receivedQty" DECIMAL(10,4),

    CONSTRAINT "purchase_order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_schedules" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "items" TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'utensils',
    "color" TEXT NOT NULL DEFAULT 'bg-slate-500',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "memberIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_task_templates" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" TEXT,
    "dueTime" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_task_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_board_tasks" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'todo',
    "todoAt" TIMESTAMP(3),
    "todoBy" TEXT,
    "completedAt" TIMESTAMP(3),
    "completedBy" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "prep_board_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_activity_logs" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "stationName" TEXT NOT NULL,
    "templateId" TEXT,
    "taskName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "userId" TEXT,
    "userName" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prep_activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prep_tasks" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "station" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "qty" TEXT,
    "dueTime" TEXT,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneBy" TEXT,
    "doneAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "prep_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_plans" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Pending',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "batch_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "batch_plan_items" (
    "id" TEXT NOT NULL,
    "batchPlanId" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeName" TEXT NOT NULL,
    "qty" TEXT NOT NULL,
    "unit" TEXT NOT NULL,

    CONSTRAINT "batch_plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_entries" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "recipeId" TEXT,
    "recipeName" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPrice" DECIMAL(10,2) NOT NULL,
    "revenue" DECIMAL(10,2) NOT NULL,
    "unitCost" DECIMAL(10,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sales_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "currentStock" DECIMAL(10,4) NOT NULL,
    "parMin" DECIMAL(10,4) NOT NULL,
    "parMax" DECIMAL(10,4) NOT NULL,
    "reorderPoint" DECIMAL(10,4) NOT NULL,
    "leadTimeDays" INTEGER NOT NULL DEFAULT 1,
    "holdingDays" INTEGER NOT NULL DEFAULT 7,
    "packUnit" TEXT,
    "packSize" DECIMAL(10,4),
    "lastCountDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_transactions" (
    "id" TEXT NOT NULL,
    "inventoryItemId" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "qty" DECIMAL(10,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "costPerUnit" DECIMAL(10,6),
    "reason" TEXT,
    "note" TEXT,
    "date" TEXT NOT NULL,
    "recipeId" TEXT,
    "varianceQty" DECIMAL(10,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_areas" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "temperature" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "notifyEnabled" BOOLEAN NOT NULL DEFAULT true,
    "alertThreshold" TEXT NOT NULL DEFAULT 'reorder',
    "digestSchedule" TEXT NOT NULL DEFAULT 'daily',
    "digestHourLocal" INTEGER NOT NULL DEFAULT 8,
    "digestDayOfWeek" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_areas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_area_watchers" (
    "id" TEXT NOT NULL,
    "storageAreaId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'watcher',
    "alertThreshold" TEXT,
    "digestSchedule" TEXT,
    "ccOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_area_watchers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "storageAreaId" TEXT,
    "ingredientId" TEXT,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "errorMsg" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notification_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_suppliers" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchasePrice" DECIMAL(10,2) NOT NULL,
    "purchaseUnit" TEXT NOT NULL,
    "conversionRate" DECIMAL(10,4) NOT NULL,
    "isPreferred" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "portion_standards" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'base',
    "portionSize" DECIMAL(10,4) NOT NULL,
    "portionUnit" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "portion_standards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmix_uploads" (
    "id" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "periodLabel" TEXT,
    "businessDate" DATE,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "totalQty" INTEGER NOT NULL DEFAULT 0,
    "totalSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pmix_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmix_items" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "menu" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "itemCode" TEXT,
    "itemName" TEXT NOT NULL,
    "qtySold" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundQty" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "pctNetCount" DECIMAL(8,4),
    "pctNetSales" DECIMAL(8,4),
    "recipeId" TEXT,

    CONSTRAINT "pmix_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmix_modifiers" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "modifierGroup" TEXT NOT NULL,
    "modifier" TEXT NOT NULL,
    "qtySold" INTEGER NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "refundQty" INTEGER NOT NULL DEFAULT 0,
    "refundAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "discountAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "pmix_modifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pmix_item_rules" (
    "id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,
    "matchType" TEXT NOT NULL DEFAULT 'contains',
    "category" TEXT NOT NULL,
    "label" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pmix_item_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingredient_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingredient_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_category_permissions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "canEdit" BOOLEAN NOT NULL DEFAULT true,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_category_permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
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

-- CreateTable
CREATE TABLE "report_stations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT 'utensils',
    "color" TEXT NOT NULL DEFAULT 'bg-slate-500',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_stations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_station_menus" (
    "id" TEXT NOT NULL,
    "stationId" TEXT NOT NULL,
    "itemName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "report_station_menus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_area_counts" (
    "id" TEXT NOT NULL,
    "ingredientId" TEXT NOT NULL,
    "storageAreaId" TEXT NOT NULL,
    "recipeQty" DECIMAL(12,4) NOT NULL,
    "countedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "storage_area_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "report_unit_chains" (
    "id" TEXT NOT NULL,
    "reportKey" TEXT,
    "ingredientId" TEXT,
    "base" TEXT NOT NULL,
    "relations" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "report_unit_chains_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_uploads" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "complaintCount" INTEGER NOT NULL DEFAULT 0,
    "discountCount" INTEGER NOT NULL DEFAULT 0,
    "hasComplaints" BOOLEAN NOT NULL DEFAULT false,
    "hasDiscounts" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_complaints" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "tableNumber" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userName" TEXT NOT NULL,
    "isUnassignedUser" BOOLEAN NOT NULL DEFAULT false,
    "actionType" TEXT NOT NULL,
    "grossAmount" DECIMAL(10,2) NOT NULL,
    "netAmount" DECIMAL(10,2) NOT NULL,
    "isUndoReconciled" BOOLEAN NOT NULL DEFAULT false,
    "itemDetail" TEXT NOT NULL,
    "isGenericItem" BOOLEAN NOT NULL DEFAULT false,
    "reasonRaw" TEXT NOT NULL,
    "reasonCategory" TEXT NOT NULL,
    "device" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_complaints_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_discounts" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "createTime" TIMESTAMP(3),
    "displayId" TEXT NOT NULL,
    "discountName" TEXT NOT NULL,
    "discountCategory" TEXT NOT NULL,
    "discountAmount" DECIMAL(10,2) NOT NULL,
    "itemCount" INTEGER NOT NULL DEFAULT 1,
    "authorizedBy" TEXT NOT NULL,
    "isAnonymousAuth" BOOLEAN NOT NULL DEFAULT false,
    "riskLevel" TEXT NOT NULL,
    "isBulkDiscount" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_reason_map" (
    "id" TEXT NOT NULL,
    "keyword" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loss_reason_map_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_sales_uploads" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "serverCount" INTEGER NOT NULL DEFAULT 0,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_sales_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "server_sales_rows" (
    "id" TEXT NOT NULL,
    "businessDate" TIMESTAMP(3) NOT NULL,
    "staffName" TEXT NOT NULL,
    "shiftStart" TIMESTAMP(3),
    "shiftEnd" TIMESTAMP(3),
    "shiftHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "discount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "netSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "chargeTips" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "gratuity" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "serviceFees" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avgPerGuest" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "avgPerOrder" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "guests" INTEGER NOT NULL DEFAULT 0,
    "orders" INTEGER NOT NULL DEFAULT 0,
    "foodSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "foodCount" INTEGER NOT NULL DEFAULT 0,
    "beverageSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "beverageCount" INTEGER NOT NULL DEFAULT 0,
    "alcoholSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "alcoholCount" INTEGER NOT NULL DEFAULT 0,
    "dessertSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "dessertCount" INTEGER NOT NULL DEFAULT 0,
    "otherSales" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "server_sales_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "ingredients_sku_key" ON "ingredients"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_categories_name_key" ON "recipe_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_recipe_category_permissions_userId_categoryId_key" ON "user_recipe_category_permissions"("userId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "recipe_ingredients_recipeId_ingredientId_key" ON "recipe_ingredients"("recipeId", "ingredientId");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_poNumber_key" ON "purchase_orders"("poNumber");

-- CreateIndex
CREATE INDEX "purchase_orders_status_idx" ON "purchase_orders"("status");

-- CreateIndex
CREATE INDEX "purchase_orders_supplierId_idx" ON "purchase_orders"("supplierId");

-- CreateIndex
CREATE INDEX "purchase_order_items_purchaseOrderId_idx" ON "purchase_order_items"("purchaseOrderId");

-- CreateIndex
CREATE INDEX "prep_task_templates_stationId_idx" ON "prep_task_templates"("stationId");

-- CreateIndex
CREATE INDEX "prep_board_tasks_date_stationId_idx" ON "prep_board_tasks"("date", "stationId");

-- CreateIndex
CREATE UNIQUE INDEX "prep_board_tasks_date_templateId_key" ON "prep_board_tasks"("date", "templateId");

-- CreateIndex
CREATE INDEX "prep_activity_logs_date_idx" ON "prep_activity_logs"("date");

-- CreateIndex
CREATE INDEX "prep_activity_logs_action_idx" ON "prep_activity_logs"("action");

-- CreateIndex
CREATE INDEX "prep_activity_logs_userId_idx" ON "prep_activity_logs"("userId");

-- CreateIndex
CREATE INDEX "prep_tasks_date_idx" ON "prep_tasks"("date");

-- CreateIndex
CREATE INDEX "sales_entries_date_idx" ON "sales_entries"("date");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_ingredientId_key" ON "inventory_items"("ingredientId");

-- CreateIndex
CREATE INDEX "inventory_transactions_inventoryItemId_idx" ON "inventory_transactions"("inventoryItemId");

-- CreateIndex
CREATE INDEX "inventory_transactions_type_idx" ON "inventory_transactions"("type");

-- CreateIndex
CREATE INDEX "inventory_transactions_date_idx" ON "inventory_transactions"("date");

-- CreateIndex
CREATE UNIQUE INDEX "storage_areas_name_key" ON "storage_areas"("name");

-- CreateIndex
CREATE INDEX "storage_area_watchers_userId_idx" ON "storage_area_watchers"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "storage_area_watchers_storageAreaId_userId_key" ON "storage_area_watchers"("storageAreaId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notification_logs_dedupeKey_key" ON "notification_logs"("dedupeKey");

-- CreateIndex
CREATE INDEX "notification_logs_type_createdAt_idx" ON "notification_logs"("type", "createdAt");

-- CreateIndex
CREATE INDEX "notification_logs_storageAreaId_idx" ON "notification_logs"("storageAreaId");

-- CreateIndex
CREATE INDEX "notification_logs_userId_idx" ON "notification_logs"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_suppliers_ingredientId_supplierId_key" ON "ingredient_suppliers"("ingredientId", "supplierId");

-- CreateIndex
CREATE INDEX "portion_standards_ingredientId_idx" ON "portion_standards"("ingredientId");

-- CreateIndex
CREATE INDEX "portion_standards_itemName_idx" ON "portion_standards"("itemName");

-- CreateIndex
CREATE INDEX "pmix_uploads_businessDate_idx" ON "pmix_uploads"("businessDate");

-- CreateIndex
CREATE INDEX "pmix_items_uploadId_idx" ON "pmix_items"("uploadId");

-- CreateIndex
CREATE INDEX "pmix_modifiers_itemId_idx" ON "pmix_modifiers"("itemId");

-- CreateIndex
CREATE INDEX "pmix_item_rules_category_isActive_idx" ON "pmix_item_rules"("category", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "ingredient_categories_name_key" ON "ingredient_categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "user_category_permissions_userId_categoryId_key" ON "user_category_permissions"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_targetTable_idx" ON "audit_logs"("targetTable");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "report_station_menus_stationId_idx" ON "report_station_menus"("stationId");

-- CreateIndex
CREATE UNIQUE INDEX "report_station_menus_stationId_itemName_key" ON "report_station_menus"("stationId", "itemName");

-- CreateIndex
CREATE INDEX "storage_area_counts_storageAreaId_idx" ON "storage_area_counts"("storageAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "storage_area_counts_ingredientId_storageAreaId_key" ON "storage_area_counts"("ingredientId", "storageAreaId");

-- CreateIndex
CREATE UNIQUE INDEX "report_unit_chains_reportKey_key" ON "report_unit_chains"("reportKey");

-- CreateIndex
CREATE UNIQUE INDEX "loss_uploads_businessDate_key" ON "loss_uploads"("businessDate");

-- CreateIndex
CREATE INDEX "loss_complaints_businessDate_idx" ON "loss_complaints"("businessDate");

-- CreateIndex
CREATE INDEX "loss_discounts_businessDate_idx" ON "loss_discounts"("businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "server_sales_uploads_businessDate_key" ON "server_sales_uploads"("businessDate");

-- CreateIndex
CREATE INDEX "server_sales_rows_businessDate_idx" ON "server_sales_rows"("businessDate");

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_storageAreaId_fkey" FOREIGN KEY ("storageAreaId") REFERENCES "storage_areas"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recipe_category_permissions" ADD CONSTRAINT "user_recipe_category_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_recipe_category_permissions" ADD CONSTRAINT "user_recipe_category_permissions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "recipe_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_history" ADD CONSTRAINT "purchase_history_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_task_templates" ADD CONSTRAINT "prep_task_templates_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "prep_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prep_board_tasks" ADD CONSTRAINT "prep_board_tasks_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "prep_task_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "batch_plan_items" ADD CONSTRAINT "batch_plan_items_batchPlanId_fkey" FOREIGN KEY ("batchPlanId") REFERENCES "batch_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_entries" ADD CONSTRAINT "sales_entries_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_transactions" ADD CONSTRAINT "inventory_transactions_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_area_watchers" ADD CONSTRAINT "storage_area_watchers_storageAreaId_fkey" FOREIGN KEY ("storageAreaId") REFERENCES "storage_areas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "storage_area_watchers" ADD CONSTRAINT "storage_area_watchers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingredient_suppliers" ADD CONSTRAINT "ingredient_suppliers_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portion_standards" ADD CONSTRAINT "portion_standards_ingredientId_fkey" FOREIGN KEY ("ingredientId") REFERENCES "ingredients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pmix_items" ADD CONSTRAINT "pmix_items_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "pmix_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pmix_modifiers" ADD CONSTRAINT "pmix_modifiers_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "pmix_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_category_permissions" ADD CONSTRAINT "user_category_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_category_permissions" ADD CONSTRAINT "user_category_permissions_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "ingredient_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "report_station_menus" ADD CONSTRAINT "report_station_menus_stationId_fkey" FOREIGN KEY ("stationId") REFERENCES "report_stations"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ── 2. Prisma migration bookkeeping table ──────────────────────────────────
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
    "id" VARCHAR(36) PRIMARY KEY,
    "checksum" VARCHAR(64) NOT NULL,
    "finished_at" TIMESTAMPTZ,
    "migration_name" VARCHAR(255) NOT NULL,
    "logs" TEXT,
    "rolled_back_at" TIMESTAMPTZ,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "applied_steps_count" INTEGER NOT NULL DEFAULT 0
);

-- ── 3. Mark every migration as applied (baseline) ──────────────────────────
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'dfe80eac62bf9374b6e36874b412ea0ef0d192ca770d1118a234096875ae8cd5', now(), '20260220060129_init', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '3977216ecff6e1678922d9cfe2edb95cbfb4c601476a780cbd5a567e0dfbf4c9', now(), '20260511000000_add_selling_price_and_sales_entries', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '95cda7b836d809bb56ced93cf044e37df15471a358fbab338eaa4f3ceb5f8b9c', now(), '20260511100000_add_delivery_price', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '45ee15641d9b2ab9b1967a8a6e66fbee89885cd7e6a74af3bf003b726697ff4f', now(), '20260512000000_add_inventory_tracking', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'd9ff4c5fb642cd7f41b129c09c99e604215bb6565f9319140493066681b0b287', now(), '20260513000000_add_v2_rbac_audit', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '2455cc6c3c20a7f51a1e666b4b5b1dce08a387bb907560ee91dd77355df30da0', now(), '20260519000000_add_sub_recipe', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'ca62f22a0220d17d016552aad2a8eef86ee100083dbd0ed73cdb498492659dc2', now(), '20260520000000_add_recipe_category_permissions', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '2add79ec65086216892df2d6d4db857df5d60a4526ac925e6956af39dee01b42', now(), '20260522000000_add_v3_sku_storage_multisupplier', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '7d2f2bb323ef38a5448b3e0235e08edb73d80617fbd17a6394bc40c91e78f784', now(), '20260522100000_add_pmix_tables', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '553b61a84ca7705aabec52259b26481307f77730c533af8f92ac491c6f8b20e1', now(), '20260524000000_add_cr_holding_days', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'c1e034e6a85e3ee3e2430b72220e9edd8ed532d46fbe61dc20956253174dcab5', now(), '20260524010000_add_portion_standards', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '52329af4e526f5b959ffaf1d5859dc01029083fdf82389f9be481142cf67304b', now(), '20260525000000_add_pmix_business_date', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '22fed2527e46bd9584553cc8bbe10b4d00403c34e9cf933d0ac4588054766512', now(), '20260526000000_add_notification_system', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '43a46895e20fa0e3cffd84768564b75dd4fb6e41cfea0e0fe8dce05eaf9d3d42', now(), '20260527000000_add_supplier_delivery_schedule', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '4021d8badfd6e111231b19d1c1d606ebce9d1d5937aa9d41defa5336db9da5f4', now(), '20260527120000_add_pmix_item_rules', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'a9a08774354db9dff0b09915573e8549eda4560dd079f31d0aa1e73fef523200', now(), '20260527130000_pmix_rules_veg_tofu_extras', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'd668d8c88c5b52682888cd713649feacb76bc233ae3ba8c2c4969afdbd8984e7', now(), '20260527140000_fix_rice_exclusion_too_broad', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '1760546cd29d30446c2bd0cf191baaebcbd75762fea1e7ec2a0ac4e62ac5ad5d', now(), '20260531000000_add_pack_size_to_inventory', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '51f23c9c93f772bdf4c8d5064ab49c1f0038f7f39b2057dd661c13aa80d1e91b', now(), '20260531100000_add_purchase_orders', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '062487478c0561b245cf878331decded09132e7e244bea398dd442539702b50b', now(), '20260531120000_add_po_received_qty', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'b5c74d460003d58bbca152a68d1933e475a6e04f46c7d4832304338abc2f1fa3', now(), '20260531140000_add_stocktake_variance', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '1d442ff7068808f704b6068c0ae88774983f595fdd0cbf66795bd47f1588b568', now(), '20260531160000_add_prep_tasks', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '975fc4c3c18267066231eb6d8fb99eaf4e905eee76f7e0e7d86fc430e7f23d7d', now(), '20260531180000_add_prep_stations', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '454692a34df974068f665c7cd429ec255972654812d98d50370f816366ddb8a2', now(), '20260531200000_prep_kanban', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'd7625c66644c67c1857375f7e16f5fe5cb476e6cea0b6b1272326160413d81f3', now(), '20260603120000_add_report_stations', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '812383b69873475b45295ea6eadcafa2e255c37b40781537d5f27a3a533f88d7', now(), '20260603140000_add_ingredient_report_unit', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '482960ef7325886f6e717fb7d4c018d54d47160cc4cbaac37700df19bb785acb', now(), '20260603160000_add_storage_area_counts', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'aab86d027731b8fc0d2ef830db80ca905ce68401a4b58f6f7f3d33ae689f1394', now(), '20260605120000_add_report_unit_chains', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), 'b76793fbcd6d9125169e64c6502872e5525ed0408dd5ef1de5d8e60f94fa4817', now(), '20260606120000_add_loss_management', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '86a2a3b290188eced1224394ff7ea576e1e0d29111dd8f6d7305c0d40aa270b7', now(), '20260606140000_add_loss_reason_map', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '9889c48c4c6e89d17fd11ea2c6b38b72c73233c015c11e4d06f2e24f20a96a90', now(), '20260608120000_add_server_performance', now(), 1) ON CONFLICT DO NOTHING;
INSERT INTO "_prisma_migrations" ("id","checksum","finished_at","migration_name","started_at","applied_steps_count") VALUES (gen_random_uuid(), '18ba192e236580805cf21118bd21ee2a225764451041acf146f1864febb9a226', now(), '20260609120000_report_unit_chain_per_item', now(), 1) ON CONFLICT DO NOTHING;
