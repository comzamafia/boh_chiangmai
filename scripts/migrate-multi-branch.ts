/**
 * Multi-branch data migration script.
 *
 * NOTE: The primary-branch backfill is now performed automatically by the SQL
 * migration `20260629005000_backfill_branches` (runs via `prisma migrate
 * deploy`). This script is therefore OPTIONAL and idempotent — keep it only as
 * a manual re-run safety net, or as the starting point for importing data from
 * the other 2 branches' old databases (connect to their DATABASE_URLs and
 * INSERT with the correct branchId).
 *
 * This script:
 *   1. Creates the 3 Branch records (Mississauga, York Mills, Parklawn)
 *   2. Backfills branchId on ALL existing rows (assigns to Mississauga)
 *   3. Creates UserBranch records for all existing users
 *
 * Usage:  npx ts-node --compiler-options '{"module":"commonjs"}' scripts/migrate-multi-branch.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BRANCHES = [
  {
    slug: "mississauga",
    name: "Chiang Mai Mississauga",
    address: "",
    phone: "",
    timezone: "America/Toronto",
    sortOrder: 0,
  },
  {
    slug: "yorkmills",
    name: "Chiang Mai York Mills",
    address: "",
    phone: "",
    timezone: "America/Toronto",
    sortOrder: 1,
  },
  {
    slug: "parklawn",
    name: "Chiang Mai Parklawn",
    address: "",
    phone: "",
    timezone: "America/Toronto",
    sortOrder: 2,
  },
];

const TABLES_TO_BACKFILL = [
  "suppliers",
  "ingredients",
  "equipment",
  "recipe_categories",
  "user_recipe_category_permissions",
  "recipes",
  "recipe_ingredients",
  "purchase_history",
  "purchase_orders",
  "purchase_order_items",
  "production_schedules",
  "prep_stations",
  "prep_task_templates",
  "prep_board_tasks",
  "prep_activity_logs",
  "prep_tasks",
  "batch_plans",
  "batch_plan_items",
  "sales_entries",
  "inventory_items",
  "inventory_transactions",
  "storage_areas",
  "storage_area_watchers",
  "notification_logs",
  "ingredient_suppliers",
  "portion_standards",
  "pmix_uploads",
  "pmix_items",
  "pmix_modifiers",
  "pmix_item_rules",
  "ingredient_categories",
  "user_category_permissions",
  "audit_logs",
  "report_stations",
  "report_station_menus",
  "storage_area_counts",
  "report_unit_chains",
  "loss_uploads",
  "loss_complaints",
  "loss_discounts",
  "loss_reason_map",
  "server_sales_uploads",
  "server_sales_rows",
  "composite_recipes",
  "composite_components",
  "menu_composite_links",
  "protein_groups",
  "protein_group_members",
];

async function main() {
  console.log("=== Multi-Branch Migration ===\n");

  // 1. Create branches (upsert to be idempotent)
  const branchRecords: Record<string, string> = {};
  for (const b of BRANCHES) {
    const branch = await prisma.branch.upsert({
      where: { slug: b.slug },
      update: {},
      create: {
        name: b.name,
        slug: b.slug,
        address: b.address,
        phone: b.phone,
        timezone: b.timezone,
        sortOrder: b.sortOrder,
      },
    });
    branchRecords[b.slug] = branch.id;
    console.log(`Branch: ${branch.name} → ${branch.id}`);
  }

  const primaryBranchId = branchRecords["mississauga"];
  console.log(`\nPrimary branch (Mississauga): ${primaryBranchId}`);

  // 2. Backfill branchId on all tables
  console.log("\n--- Backfilling branchId ---");
  for (const table of TABLES_TO_BACKFILL) {
    const result = await prisma.$executeRawUnsafe(
      `UPDATE "${table}" SET "branchId" = $1 WHERE "branchId" IS NULL`,
      primaryBranchId,
    );
    console.log(`  ${table}: ${result} rows updated`);
  }

  // 3. Create UserBranch for all existing users → primary branch
  console.log("\n--- Creating UserBranch records ---");
  const users = await prisma.user.findMany({ select: { id: true, email: true } });
  let created = 0;
  for (const user of users) {
    const existing = await prisma.userBranch.findUnique({
      where: { userId_branchId: { userId: user.id, branchId: primaryBranchId } },
    });
    if (!existing) {
      await prisma.userBranch.create({
        data: {
          userId: user.id,
          branchId: primaryBranchId,
          isDefault: true,
        },
      });
      created++;
    }
  }
  console.log(`  Created ${created} UserBranch records (${users.length} users total)`);

  // 4. Validate — check for any remaining NULLs
  console.log("\n--- Validation ---");
  let hasNulls = false;
  for (const table of TABLES_TO_BACKFILL) {
    const result = await prisma.$queryRawUnsafe<[{ count: bigint }]>(
      `SELECT count(*) as count FROM "${table}" WHERE "branchId" IS NULL`,
    );
    const count = Number(result[0].count);
    if (count > 0) {
      console.log(`  WARNING: ${table} has ${count} rows with NULL branchId`);
      hasNulls = true;
    }
  }

  if (!hasNulls) {
    console.log("  All tables backfilled successfully — zero NULLs remaining.");
    console.log("\n  Safe to proceed with NOT NULL migration.");
  } else {
    console.log("\n  FIX the above warnings before running the NOT NULL migration!");
  }

  console.log("\n=== Done ===");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
