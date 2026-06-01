/**
 * wipe-and-migrate.mjs
 * Step 1: Delete ALL recipes, ingredients, and related data from production DB.
 * Step 2: Run prisma migrate deploy to bring schema to latest.
 *
 * Run with: DATABASE_URL="..." node scripts/wipe-and-migrate.mjs
 */
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { PrismaClient } = require("@prisma/client");
const { PrismaPg } = require("@prisma/adapter-pg");
const { Pool } = require("pg");

const connStr = process.env.DATABASE_URL ?? "postgresql://padthai:padthai_secret@localhost:5432/padthai_chaiyo_boh";
const pool = new Pool({
    connectionString: connStr,
    ssl: connStr.includes("sslmode=require") ? { rejectUnauthorized: false } : undefined,
});
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

async function countTable(table) {
    try {
        const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${table}"`);
        return Number(rows[0].n);
    } catch { return -1; } // table doesn't exist
}

async function deleteTable(table, label) {
    const count = await countTable(table);
    if (count < 0) { console.log(`  – ${label}: table not found (will be created by migration)`); return; }
    if (count === 0) { console.log(`  – ${label}: already empty`); return; }
    await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
    console.log(`  ✓ Deleted ${count} ${label}`);
}

async function nullifyFk(table, column) {
    const ct = await countTable(table);
    if (ct < 0) return;
    try {
        await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${column}" = NULL WHERE "${column}" IS NOT NULL`);
        console.log(`  ✓ Nullified ${table}.${column}`);
    } catch { /* column may not exist yet */ }
}

async function main() {
    // ── List all tables ──
    const tables = await prisma.$queryRaw`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const tableNames = tables.map(r => r.tablename);
    console.log("═══════════════════════════════════════════════════");
    console.log("  Production DB Tables:");
    console.log("  " + tableNames.join(", "));
    console.log("═══════════════════════════════════════════════════\n");

    // ── Count before ──
    console.log("Current record counts:");
    for (const t of tableNames.filter(t => t !== "_prisma_migrations")) {
        const n = await countTable(t);
        if (n > 0) console.log(`  ${t}: ${n}`);
    }
    console.log("");

    // ── Step 1: Delete all data ──
    console.log("Step 1: Deleting all data...\n");

    // Nullify nullable FK references first
    await nullifyFk("pmix_items", "recipeId");
    await nullifyFk("sales_entries", "recipeId");

    // Delete in dependency order (children → parents)
    // Level 4: deepest children
    await deleteTable("pmix_modifiers",          "PMIX modifiers");
    await deleteTable("pmix_items",              "PMIX items");
    await deleteTable("pmix_uploads",            "PMIX uploads");

    // Level 3: inventory + transactions
    await deleteTable("inventory_transactions",  "inventory transactions");
    await deleteTable("inventory_items",         "inventory items");

    // Level 3: supplier links
    await deleteTable("ingredient_suppliers",    "ingredient suppliers");

    // Level 2: recipe + ingredient links
    await deleteTable("recipe_ingredients",      "recipe ingredients");
    await deleteTable("batch_plan_items",        "batch plan items");
    await deleteTable("batch_plans",             "batch plans");
    await deleteTable("production_schedules",    "production schedules");
    await deleteTable("sales_entries",           "sales entries");
    await deleteTable("purchase_history",        "purchase history");

    // Level 1: core entities
    await deleteTable("recipes",                 "recipes");
    await deleteTable("ingredients",             "ingredients");

    // Level 0: reference tables (keep users, suppliers, categories, equipment)
    // Leave these intact: users, suppliers, recipe_categories, equipment, storage_areas

    console.log("\n  ✅ All recipe & ingredient data wiped.\n");

    // ── Verify ──
    console.log("Verification:");
    for (const t of ["recipes", "ingredients", "recipe_ingredients", "sales_entries"]) {
        const n = await countTable(t);
        console.log(`  ${t}: ${n < 0 ? "table not found" : n}`);
    }
    console.log("");
}

main()
    .catch(e => { console.error("\nFailed:", e.message); process.exit(1); })
    .finally(() => { prisma.$disconnect(); pool.end(); });
