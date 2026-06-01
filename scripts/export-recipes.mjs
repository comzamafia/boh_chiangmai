// Export all recipes from production DB as CSV
// node scripts/export-recipes.mjs > recipes.csv
import pg from "pg";
const { Client } = pg;

const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
});
await client.connect();

// Check which optional columns actually exist
const { rows: colRows } = await client.query(`
    SELECT column_name FROM information_schema.columns WHERE table_name = 'recipes'
`);
const existingCols = new Set(colRows.map(c => c.column_name));
const has = (col) => existingCols.has(col);

// Build dynamic SELECT for optional columns
const sellingPriceSel   = has("sellingPrice")       ? 'CAST(r."sellingPrice" AS FLOAT)  AS selling_price,'   : 'NULL::FLOAT AS selling_price,';
const deliveryPriceSel  = has("deliveryPrice")      ? 'CAST(r."deliveryPrice" AS FLOAT) AS delivery_price,'  : 'NULL::FLOAT AS delivery_price,';
const isSubRecipeSel    = has("isSubRecipe")        ? 'r."isSubRecipe"    AS is_sub_recipe,'                 : 'FALSE AS is_sub_recipe,';
const linkedIngSel      = has("linkedIngredientId") ? 'r."linkedIngredientId" AS linked_ingredient_id,'      : 'NULL AS linked_ingredient_id,';

const { rows: recipes } = await client.query(`
    SELECT
        r.id,
        r.name,
        r.category,
        CAST(r."yieldAmount"        AS FLOAT)  AS yield_amount,
        r."yieldUnit"                           AS yield_unit,
        r."prepTime"                            AS prep_time,
        r."cookTime"                            AS cook_time,
        CAST(r."laborCostPerHour"   AS FLOAT)  AS labor_cost_per_hour,
        CAST(r."energyCostPerBatch" AS FLOAT)  AS energy_cost_per_batch,
        ${sellingPriceSel}
        ${deliveryPriceSel}
        r."isMainSauce"                         AS is_main_sauce,
        ${isSubRecipeSel}
        ${linkedIngSel}
        r."imageUrl"                            AS image_url,
        r.instructions,
        r."createdAt"                           AS created_at,
        r."updatedAt"                           AS updated_at,
        COUNT(ri.id)::int                       AS ingredient_count,
        COALESCE(SUM(
            (CAST(i."purchasePrice"   AS FLOAT)
            / NULLIF(CAST(i."conversionRate" AS FLOAT), 0)
            / NULLIF(CAST(i."yieldPercent"   AS FLOAT) / 100.0, 0))
            * CAST(ri.quantity AS FLOAT)
        ), 0)                                   AS ingredient_cost,
        STRING_AGG(i.name, '; ' ORDER BY i.name) AS ingredient_names
    FROM recipes r
    LEFT JOIN recipe_ingredients ri ON ri."recipeId" = r.id
    LEFT JOIN ingredients i         ON i.id = ri."ingredientId"
    GROUP BY r.id
    ORDER BY r.category ASC, r.name ASC
`);

await client.end();

// ── CSV builder ────────────────────────────────────────────────────────────────
const esc = (v) => {
    if (v === null || v === undefined) return '""';
    return '"' + String(v).replace(/"/g, '""') + '"';
};
const round2 = (n) => (typeof n === "number" && !isNaN(n)) ? Number(n.toFixed(2)) : "";
const pct    = (cost, price) => price ? (cost / price * 100).toFixed(2) + "%" : "N/A";
const thDate = (d) => d ? new Date(d).toLocaleString("th-TH", { timeZone: "Asia/Bangkok", hour12: false }) : "";

const headers = [
    "ID",
    "Recipe Name",
    "Category",
    "Yield Amount",
    "Yield Unit",
    "Prep Time (min)",
    "Cook Time (min)",
    "Labor Cost/hr (฿)",
    "Energy Cost/batch (฿)",
    "Selling Price (฿)",
    "Delivery Price (฿)",
    "Is Main Sauce",
    "Is Sub Recipe",
    "Linked Ingredient ID",
    "Image URL",
    "# Ingredients",
    "Ingredient Cost (฿)",
    "Labor Cost (฿)",
    "Energy Cost (฿)",
    "Total Cost/batch (฿)",
    "Food Cost % (Dine-in)",
    "Food Cost % (Delivery)",
    "Ingredient Names",
    "Instructions",
    "Created At (ICT)",
    "Updated At (ICT)",
];

const dataRows = recipes.map((r) => {
    const ingCost  = parseFloat(r.ingredient_cost) || 0;
    const labCost  = ((r.prep_time + r.cook_time) / 60) * r.labor_cost_per_hour;
    const eneCost  = r.energy_cost_per_batch;
    const totCost  = ingCost + labCost + eneCost;

    return [
        esc(r.id),
        esc(r.name),
        esc(r.category),
        esc(r.yield_amount),
        esc(r.yield_unit),
        esc(r.prep_time),
        esc(r.cook_time),
        esc(r.labor_cost_per_hour),
        esc(r.energy_cost_per_batch),
        esc(round2(r.selling_price)),
        esc(round2(r.delivery_price)),
        esc(r.is_main_sauce ? "Yes" : "No"),
        esc(r.is_sub_recipe ? "Yes" : "No"),
        esc(r.linked_ingredient_id ?? ""),
        esc(r.image_url ?? ""),
        esc(r.ingredient_count),
        esc(round2(ingCost)),
        esc(round2(labCost)),
        esc(round2(eneCost)),
        esc(round2(totCost)),
        esc(pct(totCost, r.selling_price)),
        esc(pct(totCost, r.delivery_price)),
        esc(r.ingredient_names ?? ""),
        esc(r.instructions ?? ""),
        esc(thDate(r.created_at)),
        esc(thDate(r.updated_at)),
    ].join(",");
});

const csv = [headers.map(h => `"${h}"`).join(","), ...dataRows].join("\n");
process.stdout.write(csv + "\n");
console.error(`✅ Exported ${recipes.length} recipes (${headers.length} columns)`);
