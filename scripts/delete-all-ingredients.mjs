/**
 * delete-all-ingredients.mjs
 * Deletes ALL ingredients and all cascaded data.
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
    } catch { return -1; }
}

async function deleteTable(table, label, tableNames) {
    if (!tableNames.includes(table)) {
        console.log(`  – Skipped ${label} (table not in DB)`);
        return;
    }
    try {
        const before = await countTable(table);
        await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
        console.log(`  ✓ Deleted ${before} ${label}`);
    } catch (e) {
        console.log(`  ✗ ${label}: ${e.message}`);
    }
}

async function main() {
    // List tables
    const tables = await prisma.$queryRaw`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const tableNames = tables.map(r => r.tablename);
    console.log("Tables found:", tableNames.join(", "));

    const ingCount = await countTable("ingredients");
    if (ingCount < 0) { console.log("\nNo 'ingredients' table. Nothing to do."); return; }
    if (ingCount === 0) { console.log("\nAlready empty (0 ingredients). Nothing to do."); return; }

    console.log(`\nFound ${ingCount} ingredients. Deleting linked data first...\n`);

    // Nullify nullable FKs before deleting
    if (tableNames.includes("pmix_items")) {
        await prisma.$executeRawUnsafe(`UPDATE "pmix_items" SET "recipeId" = NULL`);
        console.log("  ✓ Unlinked PMIX items from recipes");
    }

    // Delete in dependency order
    await deleteTable("inventory_transactions", "inventory transactions", tableNames);
    await deleteTable("ingredient_suppliers",   "ingredient suppliers",   tableNames);
    await deleteTable("recipe_ingredients",     "recipe ingredients",     tableNames);
    await deleteTable("inventory_items",        "inventory items",        tableNames);
    await deleteTable("ingredients",            "ingredients",            tableNames);

    const remaining = await countTable("ingredients");
    console.log(`\n✅ Done. Ingredients remaining: ${remaining}`);
}

main()
    .catch(e => { console.error("\nFailed:", e.message); process.exit(1); })
    .finally(() => { prisma.$disconnect(); pool.end(); });
