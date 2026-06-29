/**
 * GET /api/inventory/ingredient-trend?days=7&types=Out,Waste&top=30
 *
 * Returns top-N ingredients by usage, broken down per calendar day.
 * Quantities are expressed in the ingredient's PURCHASE unit
 * (same unit shown on the DailyCalendarModal PAR card) via:
 *   displayQty = recipeQty / conversionRate
 *   displayUnit = purchaseUnit
 * Falls back to recipeUnit when purchaseUnit == recipeUnit or
 * conversionRate is missing / zero.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { searchParams } = new URL(req.url);
    const days  = Math.max(1, Math.min(30, Number(searchParams.get("days") ?? 7)));
    const types = (searchParams.get("types") ?? "Out,Waste").split(",").map(s => s.trim()).filter(Boolean);
    const top   = Math.max(1, Math.min(50, Number(searchParams.get("top") ?? 30)));

    // Build the date window: last N calendar days ending today
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    const fromStr = dates[0];
    const toStr   = dates[dates.length - 1];

    // Fetch transactions — include purchaseUnit + conversionRate for unit conversion
    const txns = await prisma.inventoryTransaction.findMany({
        where: {
            branchId,
            type: { in: types as ("In" | "Out" | "Waste" | "Adjust" | "Stocktake")[] },
            date: { gte: fromStr, lte: toStr },
        },
        select: {
            ingredientId: true,
            qty:          true,
            date:         true,
            ingredient: {
                select: {
                    id:             true,
                    name:           true,
                    recipeUnit:     true,
                    purchaseUnit:   true,
                    conversionRate: true,
                    category:       { select: { name: true } },
                },
            },
        },
        orderBy: { date: "asc" },
    });

    // Accumulate per-ingredient per-date qty (stored in recipe units, converted later)
    interface Row {
        ingredientId:   string;
        ingredientName: string;
        recipeUnit:     string;
        purchaseUnit:   string;
        conversionRate: number;
        category:       string;
        totalRecipeQty: number;
        byDate:         Map<string, number>;  // date → recipe-unit qty
    }

    const ingMap = new Map<string, Row>();
    for (const txn of txns) {
        const id   = txn.ingredientId;
        const date = (txn.date as string).slice(0, 10);
        const qty  = Math.abs(Number(txn.qty));
        if (qty === 0) continue;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ing = txn.ingredient as any;
        const existing = ingMap.get(id);
        if (existing) {
            existing.totalRecipeQty += qty;
            existing.byDate.set(date, (existing.byDate.get(date) ?? 0) + qty);
        } else {
            const byDate = new Map<string, number>([[date, qty]]);
            ingMap.set(id, {
                ingredientId:   id,
                ingredientName: ing.name,
                recipeUnit:     ing.recipeUnit,
                purchaseUnit:   ing.purchaseUnit ?? ing.recipeUnit,
                conversionRate: Number(ing.conversionRate) || 1,
                category:       ing.category?.name ?? "Uncategorized",
                totalRecipeQty: qty,
                byDate,
            });
        }
    }

    // Convert to display unit (purchaseUnit), sort, slice
    const r3 = (n: number) => Math.round(n * 1000) / 1000;

    const items = [...ingMap.values()]
        .sort((a, b) => b.totalRecipeQty - a.totalRecipeQty)
        .slice(0, top)
        .map(row => {
            const conv        = row.conversionRate;
            const usePurchase = row.purchaseUnit !== row.recipeUnit && conv > 0;
            const displayUnit = usePurchase ? row.purchaseUnit : row.recipeUnit;
            const convert     = (recipeQty: number) => usePurchase ? recipeQty / conv : recipeQty;

            const totalQty = r3(convert(row.totalRecipeQty));
            return {
                ingredientId:   row.ingredientId,
                ingredientName: row.ingredientName,
                unit:           displayUnit,
                recipeUnit:     row.recipeUnit,
                purchaseUnit:   row.purchaseUnit,
                conversionRate: conv,
                category:       row.category,
                totalQty,
                avgPerDay:      r3(totalQty / days),
                byDate:         dates.map(d => r3(convert(row.byDate.get(d) ?? 0))),
            };
        });

    return NextResponse.json({ dates, items, days });
}
