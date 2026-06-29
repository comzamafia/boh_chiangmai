-- Phase 2: Backfill — create the branches and assign all existing data + users
-- to the primary (Mississauga) branch.
--
-- This runs automatically via `prisma migrate deploy` BETWEEN the add-branchId
-- migration (20260629000000) and the NOT NULL + composite-unique migration
-- (20260629010000), so the subsequent SET NOT NULL succeeds with zero NULLs.
-- It is idempotent (safe to re-run); scripts/migrate-multi-branch.ts is no
-- longer required for the primary-branch backfill (keep it only for importing
-- the other branches' data from their old databases).

-- ── 1. Create the 3 branches (stable, readable ids) ─────────────────────────
INSERT INTO "branches" ("id","name","slug","isActive","sortOrder","timezone","createdAt","updatedAt") VALUES
  ('br_mississauga','Chiang Mai Mississauga','mississauga',true,0,'America/Toronto',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('br_yorkmills','Chiang Mai York Mills','yorkmills',true,1,'America/Toronto',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP),
  ('br_parklawn','Chiang Mai Parklawn','parklawn',true,2,'America/Toronto',CURRENT_TIMESTAMP,CURRENT_TIMESTAMP)
ON CONFLICT ("slug") DO NOTHING;

-- ── 2. Backfill branchId on every data table → Mississauga ──────────────────
UPDATE "suppliers"                          SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "ingredients"                        SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "equipment"                          SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "recipe_categories"                  SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "user_recipe_category_permissions"   SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "recipes"                            SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "recipe_ingredients"                 SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "purchase_history"                   SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "purchase_orders"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "purchase_order_items"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "production_schedules"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "prep_stations"                      SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "prep_task_templates"                SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "prep_board_tasks"                   SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "prep_activity_logs"                 SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "prep_tasks"                         SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "batch_plans"                        SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "batch_plan_items"                   SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "sales_entries"                      SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "inventory_items"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "inventory_transactions"             SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "storage_areas"                      SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "storage_area_watchers"              SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "notification_logs"                  SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "ingredient_suppliers"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "portion_standards"                  SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "pmix_uploads"                       SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "pmix_items"                         SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "pmix_modifiers"                     SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "pmix_item_rules"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "ingredient_categories"              SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "user_category_permissions"          SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "audit_logs"                         SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "report_stations"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "report_station_menus"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "storage_area_counts"                SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "report_unit_chains"                 SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "loss_uploads"                       SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "loss_complaints"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "loss_discounts"                     SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "loss_reason_map"                    SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "server_sales_uploads"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "server_sales_rows"                  SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "composite_recipes"                  SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "composite_components"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "menu_composite_links"               SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "protein_groups"                     SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;
UPDATE "protein_group_members"              SET "branchId"='br_mississauga' WHERE "branchId" IS NULL;

-- ── 3. Grant every existing user access to the primary branch (as default) ──
INSERT INTO "user_branches" ("id","userId","branchId","isDefault")
SELECT gen_random_uuid()::text, u."id", 'br_mississauga', true
FROM "users" u
ON CONFLICT ("userId","branchId") DO NOTHING;
