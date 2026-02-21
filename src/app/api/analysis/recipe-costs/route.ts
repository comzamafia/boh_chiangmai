import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

function calcCostPerUnit(purchasePrice: { toString(): string }, conversionRate: { toString(): string }, yieldPercent: { toString(): string }): number {
    const price = parseFloat(purchasePrice.toString());
    const conv = parseFloat(conversionRate.toString());
    const yld = parseFloat(yieldPercent.toString());
    return price / conv / (yld / 100);
}

export async function GET() {
    try {
        const recipes = await prisma.recipe.findMany({
            where: { isMainSauce: false },
            include: {
                ingredients: { include: { ingredient: true } },
            },
        });

        const costs = recipes.map((r) => {
            const ingCost = r.ingredients.reduce((sum, ri) => {
                const qty = parseFloat(ri.quantity.toString());
                return sum + calcCostPerUnit(ri.ingredient.purchasePrice, ri.ingredient.conversionRate, ri.ingredient.yieldPercent) * qty;
            }, 0);
            const laborCost = parseFloat(r.laborCostPerHour.toString()) * ((r.prepTime + r.cookTime) / 60);
            const totalCost = ingCost + laborCost + parseFloat(r.energyCostPerBatch.toString());
            return {
                id: r.id,
                name: r.name,
                category: r.category,
                totalCost: parseFloat(totalCost.toFixed(2)),
                ingredientCost: parseFloat(ingCost.toFixed(2)),
                laborCost: parseFloat(laborCost.toFixed(2)),
                energyCost: parseFloat(r.energyCostPerBatch.toString()),
                costPerYield: parseFloat((totalCost / parseFloat(r.yieldAmount.toString())).toFixed(2)),
            };
        });

        return NextResponse.json(costs);
    } catch {
        return NextResponse.json({ error: "Failed to calculate recipe costs" }, { status: 500 });
    }
}
