import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * GET /api/analysis/price-trends
 * Returns historical unit price per ingredient from PurchaseHistory.
 * Groups by ingredient name + month (YYYY-MM).
 * Also returns price variance alerts (>10% increase vs previous purchase).
 */
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const months = parseInt(searchParams.get("months") ?? "6");

        // Fetch all purchase history ordered by date
        const history = await prisma.purchaseHistory.findMany({
            orderBy: [{ ingredient: "asc" }, { date: "asc" }],
            include: { supplier: { select: { id: true, name: true } } },
        });

        // Build per-ingredient time series
        const seriesMap = new Map<string, { date: Date; unitPrice: number }[]>();

        for (const record of history) {
            const name      = record.ingredient;
            const unitPrice = Number(record.unitPrice);
            const date      = new Date(record.date);
            if (!seriesMap.has(name)) seriesMap.set(name, []);
            seriesMap.get(name)!.push({ date, unitPrice });
        }

        // Build monthly aggregates for each ingredient
        const cutoff = new Date();
        cutoff.setMonth(cutoff.getMonth() - months);

        type MonthPoint = { month: string; [ingredient: string]: number | string };
        const monthlyMap = new Map<string, MonthPoint>();

        for (const [name, points] of seriesMap.entries()) {
            for (const { date, unitPrice } of points) {
                if (date < cutoff) continue;
                const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
                if (!monthlyMap.has(month)) monthlyMap.set(month, { month });
                const existing = monthlyMap.get(month)![name];
                // Average if multiple receipts in same month
                if (existing === undefined) {
                    monthlyMap.get(month)![name] = unitPrice;
                } else {
                    monthlyMap.get(month)![name] = ((existing as number) + unitPrice) / 2;
                }
            }
        }

        const monthlyTrend = Array.from(monthlyMap.values()).sort((a, b) =>
            (a.month as string).localeCompare(b.month as string)
        );

        // Build price variance alerts: flag if latest price > prev price by >10%
        const alerts: {
            ingredient: string;
            supplierId: string;
            supplierName: string;
            prevPrice: number;
            newPrice: number;
            changePct: number;
            date: string;
        }[] = [];

        for (const [name, points] of seriesMap.entries()) {
            if (points.length < 2) continue;
            const last = points[points.length - 1];
            const prev = points[points.length - 2];
            const changePct = (last.unitPrice - prev.unitPrice) / prev.unitPrice;
            if (changePct > 0.10) {
                const rec = history.find(
                    h => h.ingredient === name && new Date(h.date).getTime() === last.date.getTime()
                );
                alerts.push({
                    ingredient:   name,
                    supplierId:   rec?.supplierId ?? "",
                    supplierName: rec?.supplier?.name ?? "",
                    prevPrice:    prev.unitPrice,
                    newPrice:     last.unitPrice,
                    changePct:    Math.round(changePct * 100),
                    date:         last.date.toISOString().split("T")[0],
                });
            }
        }

        // Top ingredient names for chart selection
        const ingredientNames = Array.from(seriesMap.keys()).sort();

        return NextResponse.json({ monthlyTrend, alerts, ingredientNames });
    } catch {
        return NextResponse.json({ error: "Failed to fetch price trends" }, { status: 500 });
    }
}
