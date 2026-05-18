import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

const csv = readFileSync(new URL("../equipment-export.csv", import.meta.url), "utf8");
const lines = csv.trim().split("\n").slice(1); // skip header

const rows = lines.map(line => {
    const [name, type, status] = line.split(",").map(v => v.trim().replace(/^"|"$/g, ""));
    return { id: randomUUID(), name, type, status };
});

let created = 0;
let skipped = 0;

for (const row of rows) {
    const existing = await prisma.equipment.findFirst({ where: { name: row.name } });
    if (existing) {
        console.log(`  SKIP (exists): ${row.name}`);
        skipped++;
    } else {
        await prisma.equipment.create({ data: row });
        console.log(`  CREATED: ${row.name}`);
        created++;
    }
}

console.log(`\nDone: ${created} created, ${skipped} skipped.`);

await prisma.$disconnect();
await pool.end();
