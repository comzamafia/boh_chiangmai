import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { writeFileSync } from "node:fs";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function csvEscape(v) {
    if (v == null) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g, '""')}"` : s;
}

const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
const ingredients = await prisma.ingredient.findMany({
    include: { supplier: true },
    orderBy: { name: "asc" },
});
const equipment = await prisma.equipment.findMany({ orderBy: { name: "asc" } });

// suppliers.csv
const supRows = [
    "Name,Contact,Email,Phone,Address,Status,IsSpecial",
    ...suppliers.map(s => [s.name, s.contact, s.email, s.phone, s.address, s.status, s.isSpecial]
        .map(csvEscape).join(",")),
].join("\n");
writeFileSync("./suppliers-export.csv", supRows, "utf8");

// ingredients.csv (matches /import-ingredients format)
const ingRows = [
    "Name,Supplier Name,Purchase Unit,Purchase Price,Recipe Unit,Yield %,Conversion Rate,Group",
    ...ingredients.map(i => [
        i.name, i.supplier.name, i.purchaseUnit, Number(i.purchasePrice),
        i.recipeUnit, Number(i.yieldPercent), Number(i.conversionRate), i.groupId,
    ].map(csvEscape).join(",")),
].join("\n");
writeFileSync("./ingredients-export.csv", ingRows, "utf8");

// equipment.csv
const eqRows = [
    "Name,Type,Status",
    ...equipment.map(e => [e.name, e.type, e.status].map(csvEscape).join(",")),
].join("\n");
writeFileSync("./equipment-export.csv", eqRows, "utf8");

console.log(`Exported ${suppliers.length} suppliers → suppliers-export.csv`);
console.log(`Exported ${ingredients.length} ingredients → ingredients-export.csv`);
console.log(`Exported ${equipment.length} equipment → equipment-export.csv`);

await prisma.$disconnect();
await pool.end();
