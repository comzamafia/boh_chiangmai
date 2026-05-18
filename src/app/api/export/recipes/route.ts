import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

function csvCell(val: unknown): string {
    const s = val == null ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function csvRow(cells: unknown[]): string {
    return cells.map(csvCell).join(",");
}

// GET /api/export/recipes — download all recipes + their ingredients as CSV
export async function GET() {
    try {
        const recipes = await prisma.recipe.findMany({
            include: {
                ingredients: {
                    include: {
                        ingredient: {
                            include: { supplier: { select: { name: true } } },
                        },
                    },
                },
            },
            orderBy: [{ category: "asc" }, { name: "asc" }],
        });

        // ─── Sheet 1: Recipes summary ────────────────────────────────────────
        const recipeHeaders = [
            "Name",
            "Category",
            "Yield Amount",
            "Yield Unit",
            "Prep Time (min)",
            "Cook Time (min)",
            "Labor Cost/hr (THB)",
            "Energy Cost/batch (THB)",
            "Selling Price (THB)",
            "Delivery Price (THB)",
            "Is Main Sauce",
            "Ingredient Count",
            "Ingredient Names",
        ];

        const recipeRows = recipes.map(r => {
            const ingNames = r.ingredients.map(ri => ri.ingredient.name).join("; ");
            return csvRow([
                r.name,
                r.category,
                Number(r.yieldAmount),
                r.yieldUnit,
                r.prepTime,
                r.cookTime,
                Number(r.laborCostPerHour),
                Number(r.energyCostPerBatch),
                r.sellingPrice != null ? Number(r.sellingPrice) : "",
                r.deliveryPrice != null ? Number(r.deliveryPrice) : "",
                r.isMainSauce ? "Yes" : "No",
                r.ingredients.length,
                ingNames,
            ]);
        });

        // ─── Sheet 2: Recipe Ingredients detail ──────────────────────────────
        const ingHeaders = [
            "Recipe Name",
            "Recipe Category",
            "Ingredient Name",
            "Supplier",
            "Quantity",
            "Unit",
            "Purchase Price (THB)",
            "Effective Cost per Recipe Unit (THB)",
            "Line Cost (THB)",
        ];

        const ingRows: string[] = [];
        for (const r of recipes) {
            for (const ri of r.ingredients) {
                const i      = ri.ingredient;
                const price  = Number(i.purchasePrice);
                const rate   = Number(i.conversionRate);
                const yld    = Number(i.yieldPercent);
                const effCost = (rate > 0 && yld > 0) ? (price / rate) / (yld / 100) : 0;
                const lineCost = effCost * Number(ri.quantity);
                ingRows.push(csvRow([
                    r.name,
                    r.category,
                    i.name,
                    i.supplier?.name ?? "",
                    Number(ri.quantity),
                    i.recipeUnit,
                    price.toFixed(2),
                    effCost.toFixed(4),
                    lineCost.toFixed(4),
                ]));
            }
        }

        // Combine both sections separated by a blank line and a section header
        const lines = [
            "=== RECIPES ===",
            csvRow(recipeHeaders),
            ...recipeRows,
            "",
            "=== RECIPE INGREDIENTS ===",
            csvRow(ingHeaders),
            ...ingRows,
        ];

        const csv = lines.join("\r\n");
        const bom = "﻿"; // UTF-8 BOM

        return new NextResponse(bom + csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="recipes-${new Date().toISOString().slice(0,10)}.csv"`,
            },
        });
    } catch (e) {
        console.error("Export recipes error:", e);
        return NextResponse.json({ error: "Failed to export recipes" }, { status: 500 });
    }
}
