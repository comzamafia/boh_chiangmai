/**
 * Export all Recipe rows from production DB to CSV string.
 * Run with:  $env:DATABASE_URL="<prod_url>"; npx ts-node --project tsconfig.json scripts/export-recipes-to-csv.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const recipes = await prisma.recipe.findMany({
        include: {
            ingredients: {
                include: { ingredient: true },
            },
        },
        orderBy: [{ category: "asc" }, { name: "asc" }],
    });

    // Helper: sum ingredient cost
    const ingredientCost = (r: (typeof recipes)[0]) =>
        r.ingredients.reduce((sum, ri) => {
            const price = Number(ri.ingredient.purchasePrice);
            const qty   = Number(ri.quantity);
            const conv  = Number(ri.ingredient.conversionRate) || 1;
            const yld   = Number(ri.ingredient.yieldPercent) / 100 || 1;
            return sum + (price / conv / yld) * qty;
        }, 0);

    // Helper: labor cost
    const laborCost = (r: (typeof recipes)[0]) =>
        ((Number(r.prepTime) + Number(r.cookTime)) / 60) * Number(r.laborCostPerHour);

    // Helper: total cost per batch
    const totalCost = (r: (typeof recipes)[0]) =>
        ingredientCost(r) + laborCost(r) + Number(r.energyCostPerBatch);

    // Helper: food cost %
    const fcPct = (r: (typeof recipes)[0]) => {
        const sp = Number(r.sellingPrice);
        if (!sp) return "";
        return ((totalCost(r) / sp) * 100).toFixed(2) + "%";
    };

    // CSV header
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
        "# Ingredients",
        "Ingredient Cost (฿)",
        "Labor Cost (฿)",
        "Total Cost (฿)",
        "Food Cost %",
        "Ingredient Names",
        "Instructions",
        "Created At",
        "Updated At",
    ];

    const esc = (v: string | number | boolean | null | undefined) => {
        const s = String(v ?? "");
        return `"${s.replace(/"/g, '""')}"`;
    };

    const rows = recipes.map((r) => {
        const ingCost  = ingredientCost(r);
        const labCost  = laborCost(r);
        const totCost  = ingCost + labCost + Number(r.energyCostPerBatch);
        const ingNames = r.ingredients.map(ri => ri.ingredient.name).join("; ");

        return [
            esc(r.id),
            esc(r.name),
            esc(r.category),
            esc(Number(r.yieldAmount)),
            esc(r.yieldUnit),
            esc(r.prepTime),
            esc(r.cookTime),
            esc(Number(r.laborCostPerHour)),
            esc(Number(r.energyCostPerBatch)),
            esc(r.sellingPrice != null ? Number(r.sellingPrice) : ""),
            esc(r.deliveryPrice != null ? Number(r.deliveryPrice) : ""),
            esc(r.isMainSauce ? "Yes" : "No"),
            esc(r.isSubRecipe ? "Yes" : "No"),
            esc(r.linkedIngredientId ?? ""),
            esc(r.ingredients.length),
            esc(ingCost.toFixed(2)),
            esc(labCost.toFixed(2)),
            esc(totCost.toFixed(2)),
            esc(fcPct(r)),
            esc(ingNames),
            esc(r.instructions ?? ""),
            esc(r.createdAt.toISOString()),
            esc(r.updatedAt.toISOString()),
        ].join(",");
    });

    const csv = [headers.map(h => `"${h}"`).join(","), ...rows].join("\n");
    process.stdout.write(csv);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
