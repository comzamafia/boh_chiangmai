/**
 * GET /api/inventory/ingredient-trend?days=7&types=Out,Waste
 *
 * Returns the top 30 ingredients by total "Out" (+ optionally "Waste")
 * transaction qty over the last N calendar days, broken down per day.
 *
 * Response:
 *   {
 *     dates:  string[];          // N dates ascending (YYYY-MM-DD)
 *     items:  IngredientTrendRow[];
 *     days:   number;
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic  = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days  = Math.max(1, Math.min(30, Number(searchParams.get("days") ?? 7)));
    const types = (searchParams.get("types") ?? "Out,Waste").split(",").map(s => s.trim()).filter(Boolean);
    const top   = Math.max(1, Math.min(50, Number(searchParams.get("top") ?? 30)));

    // Build the date range: last N calendar days ending today
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

    // Fetch all matching transactions in the window
    const txns = await prisma.inventoryTransaction.findMany({
        where: {
            type: { in: types as ("In" | "Out" | "Waste" | "Adjust" | "Stocktake")[] },
            date: { gte: fromStr, lte: toStr },
        },
        select: {
            ingredientId: true,
            qty:          true,
            date:         true,
            ingredient:   { select: { id: true, name: true, recipeUnit: true, categoryId: true,
                category: { select: { name: true } } } },
        },
        orderBy: { date: "asc" },
    });

    // Accumulate per-ingredient per-date qty
    interface Row {
        ingredientId:   string;
        ingredientName: string;
        unit:           string;
        category:       string;
        totalQty:       number;
        byDate:         Map<string, number>;  // date → qty
    }

    const ingMap = new Map<string, Row>();
    for (const txn of txns) {
        const id   = txn.ingredientId;
        const date = (txn.date as string).slice(0, 10);
        const qty  = Math.abs(Number(txn.qty));
        if (qty === 0) continue;

        const row = ingMap.get(id);
        if (row) {
            row.totalQty += qty;
            row.byDate.set(date, (row.byDate.get(date) ?? 0) + qty);
        } else {
            const byDate = new Map<string, number>();
            byDate.set(date, qty);
            ingMap.set(id, {
                ingredientId:   id,
                ingredientName: (txn.ingredient as { name: string }).name,
                unit:           (txn.ingredient as { recipeUnit: string }).recipeUnit,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                category:       (txn.ingredient as any).category?.name ?? "Uncategorized",
                totalQty:       qty,
                byDate,
            });
        }
    }

    // Sort by total, take top N, convert byDate map → array parallel to dates
    const items = [...ingMap.values()]
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, top)
        .map(row => ({
            ingredientId:   row.ingredientId,
            ingredientName: row.ingredientName,
            unit:           row.unit,
            category:       row.category,
            totalQty:       +row.totalQty.toFixed(3),
            avgPerDay:      +(row.totalQty / days).toFixed(2),
            byDate:         dates.map(d => +(row.byDate.get(d) ?? 0).toFixed(3)),
        }));

    return NextResponse.json({ dates, items, days });
}
