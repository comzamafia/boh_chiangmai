/**
 * Convert all Weight ingredient recipe units → oz
 *               all Volume ingredient recipe units → fl oz
 * Count ingredients are left unchanged.
 *
 * Run: DATABASE_URL="..." node scripts/convert-to-oz.mjs
 */
import pg from "pg";
const { Client } = pg;

// Conversion factors: how many oz (or fl oz) per 1 of that unit
const TO_OZ = {
    // Weight → oz
    g:   1 / 28.349523,
    kg:  1000 / 28.349523,
    lb:  16,
    oz:  1,
    // Volume → fl oz
    ml:      1 / 29.5735,
    L:       1000 / 29.5735,
    "fl oz": 1,
    cup:     8,
    tbsp:    0.5,
    tsp:     1 / 6,
};

const TARGET_UNIT = { Weight: "oz", Volume: "fl oz" };

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await client.connect();

// Fetch all ingredients
const { rows } = await client.query(`
    SELECT id, name, "groupId", "purchaseUnit", "recipeUnit",
           CAST("conversionRate" AS FLOAT) AS "conversionRate"
    FROM ingredients
    ORDER BY "groupId", name
`);

let converted = 0, skipped = 0, errors = 0;

await client.query("BEGIN");

for (const row of rows) {
    const targetUnit = TARGET_UNIT[row.groupId];
    if (!targetUnit) { skipped++; continue; } // Count — skip

    const factor = TO_OZ[row.recipeUnit];
    if (!factor) {
        console.error(`⚠ ${row.name}: unknown recipeUnit "${row.recipeUnit}" — skipping`);
        errors++;
        continue;
    }

    if (row.recipeUnit === targetUnit) {
        console.log(`✓ ${row.name}: already in ${targetUnit} — skip`);
        skipped++;
        continue;
    }

    const newRate = row.conversionRate * factor;

    await client.query(
        `UPDATE ingredients SET "recipeUnit" = $1, "conversionRate" = $2, "updatedAt" = NOW() WHERE id = $3`,
        [targetUnit, newRate, row.id]
    );

    console.log(
        `✅ ${row.name.padEnd(30)} 1 ${row.purchaseUnit} = ${row.conversionRate.toFixed(4)} ${row.recipeUnit}` +
        ` → ${newRate.toFixed(4)} ${targetUnit}`
    );
    converted++;
}

await client.query("COMMIT");
await client.end();

console.log(`\n─────────────────────────────────────────`);
console.log(`✅ Converted: ${converted}`);
console.log(`⏭  Skipped:   ${skipped}`);
if (errors > 0) console.log(`❌ Errors:    ${errors}`);
console.log(`Done.`);
