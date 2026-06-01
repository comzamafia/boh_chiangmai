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

async function main() {
    const tables = await prisma.$queryRaw`
        SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename
    `;
    const tableNames = tables.map(r => r.tablename);
    console.log("═══════════════════════════════════════════════════");
    console.log("  Production DB Schema (post-migration)");
    console.log("═══════════════════════════════════════════════════\n");
    console.log(`  Total tables: ${tableNames.length}\n`);
    for (const t of tableNames) {
        if (t === "_prisma_migrations") continue;
        const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}"`);
        const n = Number(rows[0].n);
        console.log(`  ${n > 0 ? "●" : "○"} ${t.padEnd(32)} ${n} rows`);
    }

    // Check key V3 tables exist
    const expected = [
        "storage_areas", "ingredient_suppliers", "inventory_items",
        "inventory_transactions", "sales_entries", "audit_logs",
        "pmix_uploads", "pmix_items", "pmix_modifiers",
        "user_recipe_category_permissions",
    ];
    console.log("\n  V3 table check:");
    for (const t of expected) {
        const exists = tableNames.includes(t);
        console.log(`    ${exists ? "✓" : "✗"} ${t}`);
    }
}

main()
    .catch(e => console.error(e.message))
    .finally(() => { prisma.$disconnect(); pool.end(); });
