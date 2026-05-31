/**
 * GET /api/reports/food-cost-variance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Per-ingredient food-cost variance over a period. Surfaces where money is
 * leaking: waste, and physical-count shrinkage (counted < expected).
 *
 * For each tracked ingredient in [from, to]:
 *   salesUsage      = Σ "Out" qty tagged autodeplete:*   (sales × recipe BOM)
 *   manualOut       = Σ "Out" qty NOT tagged autodeplete (manual adjustments)
 *   wasteQty        = Σ "Waste" qty
 *   countVariance   = Σ Stocktake.varianceQty            (counted − expected)
 *   received        = Σ "In" qty
 *   unitCost        = averageCostPerBaseUnit ?? purchasePrice / conversionRate
 *   lossQty         = wasteQty + max(0, −countVariance)  (unaccounted loss)
 *   lossValue       = lossQty × unitCost
 *
 * Sorted by lossValue desc so the worst offenders are first.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
    const from = searchParams.get("from") ?? to;

    // All transactions in range, with ingredient cost basis
    const txns = await prisma.inventoryTransaction.findMany({
        where: { date: { gte: from, lte: to } },
        select: {
            ingredientId: true,
            type:         true,
            qty:          true,
            note:         true,
            varianceQty:  true,
            ingredient: {
                select: {
                    name: true, recipeUnit: true, purchaseUnit: true,
                    purchasePrice: true, conversionRate: true,
                    averageCostPerBaseUnit: true,
                    category: { select: { name: true } },
                    inventoryItem: { select: { id: true } },
                },
            },
        },
    });

    interface Row {
        ingredientId:   string;
        name:           string;
        category:       string;
        unit:           string;
        salesUsage:     number;
        manualOut:      number;
        wasteQty:       number;
        countVariance:  number;   // signed (negative = shrinkage)
        received:       number;
        unitCost:       number;
    }
    const map = new Map<string, Row>();

    for (const t of txns) {
        const ing = t.ingredient;
        if (!ing?.inventoryItem) continue;   // only tracked ingredients
        const qty = Math.abs(Number(t.qty));

        let row = map.get(t.ingredientId);
        if (!row) {
            const conv     = Number(ing.conversionRate) || 1;
            const unitCost = ing.averageCostPerBaseUnit != null
                ? Number(ing.averageCostPerBaseUnit)
                : (conv > 0 ? Number(ing.purchasePrice) / conv : 0);
            row = {
                ingredientId:  t.ingredientId,
                name:          ing.name,
                category:      ing.category?.name ?? "Uncategorized",
                unit:          ing.recipeUnit,
                salesUsage:    0, manualOut: 0, wasteQty: 0,
                countVariance: 0, received: 0,
                unitCost,
            };
            map.set(t.ingredientId, row);
        }

        switch (t.type) {
            case "Out":
                if ((t.note ?? "").startsWith("autodeplete:")) row.salesUsage += qty;
                else                                            row.manualOut  += qty;
                break;
            case "Waste":     row.wasteQty += qty; break;
            case "In":        row.received += qty; break;
            case "Stocktake":
                if (t.varianceQty != null) row.countVariance += Number(t.varianceQty);
                break;
        }
    }

    const r2 = (n: number) => Math.round(n * 100) / 100;
    const items = [...map.values()].map(row => {
        const shrinkage = Math.max(0, -row.countVariance);      // missing at count
        const lossQty   = row.wasteQty + shrinkage;
        const lossValue = lossQty * row.unitCost;
        return {
            ingredientId:  row.ingredientId,
            name:          row.name,
            category:      row.category,
            unit:          row.unit,
            salesUsage:    r2(row.salesUsage),
            manualOut:     r2(row.manualOut),
            wasteQty:      r2(row.wasteQty),
            countVariance: r2(row.countVariance),
            received:      r2(row.received),
            unitCost:      Math.round(row.unitCost * 1000000) / 1000000,
            lossQty:       r2(lossQty),
            lossValue:     r2(lossValue),
        };
    })
    .filter(r => r.salesUsage || r.wasteQty || r.countVariance || r.manualOut || r.received)
    .sort((a, b) => b.lossValue - a.lossValue);

    const totals = {
        wasteValue:     r2(items.reduce((s, i) => s + i.wasteQty * i.unitCost, 0)),
        shrinkageValue: r2(items.reduce((s, i) => s + Math.max(0, -i.countVariance) * i.unitCost, 0)),
        lossValue:      r2(items.reduce((s, i) => s + i.lossValue, 0)),
        salesUsageValue:r2(items.reduce((s, i) => s + i.salesUsage * i.unitCost, 0)),
    };

    return NextResponse.json({ from, to, items, totals });
}
