/**
 * Preview: show how every ingredient's unit conversion will look after converting to oz / fl oz
 * Run: node scripts/preview-oz-conversion.mjs
 */
import pg from "pg";
const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await client.connect();

const { rows } = await client.query(`
    SELECT id, name, "groupId", "purchaseUnit", "recipeUnit",
           CAST("conversionRate" AS FLOAT) AS "conversionRate",
           CAST("purchasePrice" AS FLOAT) AS "purchasePrice",
           CAST("yieldPercent" AS FLOAT) AS "yieldPercent"
    FROM ingredients
    ORDER BY "groupId", name
`);

await client.end();

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

const TARGET = { Weight: "oz", Volume: "fl oz" };

console.log("\n=== Unit Conversion Preview: → oz / fl oz ===\n");
console.log(
    "Name".padEnd(30),
    "Group".padEnd(8),
    "Before".padEnd(30),
    "After".padEnd(30),
    "Eff Cost/oz"
);
console.log("─".repeat(115));

let canConvert = 0, skip = 0;

for (const row of rows) {
    const target = TARGET[row.groupId];
    if (!target) { skip++; continue; } // Count group — skip

    const factor = TO_OZ[row.recipeUnit];
    if (!factor) {
        console.log(`${row.name.padEnd(30)} ⚠ unknown recipeUnit: ${row.recipeUnit}`);
        skip++;
        continue;
    }

    const newRate = row.conversionRate * factor;
    const effCostOld = row.purchasePrice / row.conversionRate / (row.yieldPercent / 100);
    const effCostNew = row.purchasePrice / newRate / (row.yieldPercent / 100);

    const before = `1 ${row.purchaseUnit} = ${row.conversionRate.toFixed(4)} ${row.recipeUnit}`;
    const after  = `1 ${row.purchaseUnit} = ${newRate.toFixed(4)} ${target}`;

    console.log(
        row.name.slice(0, 29).padEnd(30),
        row.groupId.padEnd(8),
        before.padEnd(30),
        after.padEnd(30),
        `฿${effCostOld.toFixed(4)}/${row.recipeUnit} → ฿${effCostNew.toFixed(4)}/${target}`
    );
    canConvert++;
}

console.log("─".repeat(115));
console.log(`\n✅ Will convert: ${canConvert} ingredients`);
console.log(`⏭  Skipped (Count group): ${skip}`);
console.log("\nRun convert-to-oz.mjs to apply.");
