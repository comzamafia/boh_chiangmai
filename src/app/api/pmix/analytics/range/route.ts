/**
 * GET /api/pmix/analytics/range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Aggregates PMIX data across all uploads whose businessDate (or uploadedAt)
 * falls within [from, to] inclusive.
 *
 * Returns:
 *   - uploadIds[]            — which uploads are included
 *   - dayCount               — number of distinct business dates
 *   - periodFrom / periodTo  — actual date bounds found
 *   - totals: qty, sales, items, refunds
 *   - topItems[]             — top 20 by qty, with daily averages
 *   - categoryBreakdown[]    — sales + qty by category
 *   - dailyTrend[]           — per-day sales for the area chart
 *   - proteinTotals[]        — main protein usage across all days
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!fromStr || !toStr) {
        return NextResponse.json({ error: "from and to are required (YYYY-MM-DD)" }, { status: 400 });
    }

    const fromDate = new Date(fromStr + "T00:00:00.000Z");
    const toDate   = new Date(toStr   + "T23:59:59.999Z");

    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Find all uploads in range (match businessDate OR fall back to uploadedAt)
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                {
                    businessDate: null,
                    uploadedAt:   { gte: fromDate, lte: toDate },
                },
            ],
        },
        select: {
            id:           true,
            businessDate: true,
            uploadedAt:   true,
            periodLabel:  true,
            totalQty:     true,
            totalSales:   true,
        },
        orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
    });

    if (uploads.length === 0) {
        return NextResponse.json({
            uploadIds: [], dayCount: 0, uploadCount: 0,
            periodFrom: fromStr, periodTo: toStr,
            totals: {
                qty: 0, grossSales: "0.00", netSales: "0.00",
                refundQty: 0, refundAmount: "0.00",
                avgSalesPerDay: 0, avgQtyPerDay: 0,
            },
            topItems: [], categoryBreakdown: [], dailyTrend: [], proteinTotals: [],
            ingredientSummary: {
                mainProtein:  { byType: [], byDish: [], total: 0 },
                extraProtein: { byType: [], byDish: [], total: 0 },
                hasProteinData: false,
            },
            message: "No uploads found in this date range",
        });
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 2. Load all items across all uploads
    const items = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds } },
        include: { modifiers: true },
    });

    // 3. Aggregate top items (by itemName across all uploads)
    const itemMap = new Map<string, {
        itemName: string; category: string;
        qtySold: number; netSales: number; grossSales: number;
        refundQty: number; refundAmount: number; discountAmount: number;
    }>();

    for (const item of items) {
        const key = `${item.category}|||${item.itemName}`;
        const existing = itemMap.get(key);
        if (existing) {
            existing.qtySold        += Number(item.qtySold);
            existing.netSales       += Number(item.netSales);
            existing.grossSales     += Number(item.grossSales);
            existing.refundQty      += Number(item.refundQty);
            existing.refundAmount   += Number(item.refundAmount);
            existing.discountAmount += Number(item.discountAmount);
        } else {
            itemMap.set(key, {
                itemName:       item.itemName,
                category:       item.category,
                qtySold:        Number(item.qtySold),
                netSales:       Number(item.netSales),
                grossSales:     Number(item.grossSales),
                refundQty:      Number(item.refundQty),
                refundAmount:   Number(item.refundAmount),
                discountAmount: Number(item.discountAmount),
            });
        }
    }

    const dayCount = new Set(
        uploads.map((u: { businessDate: Date | null; uploadedAt: Date }) =>
            (u.businessDate ?? u.uploadedAt).toISOString().slice(0, 10)
        )
    ).size;

    const topItems = [...itemMap.values()]
        .sort((a, b) => b.qtySold - a.qtySold)
        .slice(0, 20)
        .map(it => ({
            ...it,
            netSales:       it.netSales.toFixed(2),
            grossSales:     it.grossSales.toFixed(2),
            refundAmount:   it.refundAmount.toFixed(2),
            discountAmount: it.discountAmount.toFixed(2),
            avgQtyPerDay:   dayCount > 0 ? +(it.qtySold / dayCount).toFixed(1) : 0,
            avgSalesPerDay: dayCount > 0 ? +(it.netSales  / dayCount).toFixed(2) : 0,
        }));

    // 4. Category breakdown
    const catMap = new Map<string, { category: string; qtySold: number; netSales: number }>();
    for (const it of itemMap.values()) {
        const c = catMap.get(it.category) ?? { category: it.category, qtySold: 0, netSales: 0 };
        c.qtySold  += it.qtySold;
        c.netSales += it.netSales;
        catMap.set(it.category, c);
    }
    const categoryBreakdown = [...catMap.values()]
        .sort((a, b) => b.netSales - a.netSales)
        .map(c => ({ ...c, netSales: c.netSales.toFixed(2) }));

    // 5. Daily trend (one row per distinct business date)
    const trendMap = new Map<string, { date: string; netSales: number; qtySold: number; uploadCount: number }>();
    for (const up of uploads) {
        const date = (up.businessDate ?? up.uploadedAt).toISOString().slice(0, 10);
        const ex   = trendMap.get(date) ?? { date, netSales: 0, qtySold: 0, uploadCount: 0 };
        ex.netSales    += Number(up.totalSales ?? 0);
        ex.qtySold     += Number(up.totalQty   ?? 0);
        ex.uploadCount += 1;
        trendMap.set(date, ex);
    }
    const dailyTrend = [...trendMap.values()]
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(d => ({ ...d, netSales: +d.netSales.toFixed(2) }));

    // 6. Protein totals from modifiers (main + extras + by-dish)
    const mainByType  = new Map<string, number>();
    const extraByType = new Map<string, number>();
    const mainByDish  = new Map<string, { category: string; dish: string; proteinType: string; qty: number }>();
    const extraByDish = new Map<string, { category: string; dish: string; proteinType: string; qty: number }>();

    for (const item of items) {
        const dishName = item.itemName as string;
        const category = (item.category as string) ?? "";
        for (const mod of item.modifiers) {
            const grp  = (mod.modifierGroup ?? "").toLowerCase();
            const name = (mod.modifier ?? "").trim();
            const qty  = Number(mod.qtySold ?? 0);
            if (!name) continue;
            const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
            const isMain  = grp.includes("protein") && !isExtra;
            const dishKey = `${dishName}|||${name}`;

            if (isMain) {
                mainByType.set(name, (mainByType.get(name) ?? 0) + qty);
                const ex = mainByDish.get(dishKey);
                if (ex) ex.qty += qty;
                else    mainByDish.set(dishKey, { category, dish: dishName, proteinType: name, qty });
            } else if (isExtra) {
                extraByType.set(name, (extraByType.get(name) ?? 0) + qty);
                const ex = extraByDish.get(dishKey);
                if (ex) ex.qty += qty;
                else    extraByDish.set(dishKey, { category, dish: dishName, proteinType: name, qty });
            }
        }
    }

    // Load portion standards for totalUsed = qty × portionSize
    const allProteinNames = [...mainByType.keys(), ...extraByType.keys()];
    const standards = await db.portionStandard.findMany({
        where: { type: { in: ["modifier", "base"] } },
        include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } },
    });
    const stdByName = new Map<string, { portionSize: number; portionUnit: string; ingredientName: string; ingredientId: string }>();
    for (const s of standards) {
        stdByName.set(String(s.itemName).toLowerCase().trim(), {
            portionSize:    Number(s.portionSize),
            portionUnit:    s.portionUnit,
            ingredientName: s.ingredient?.name ?? s.itemName,
            ingredientId:   s.ingredientId,
        });
    }
    function withPortion(proteinType: string, qty: number) {
        const std = stdByName.get(proteinType.toLowerCase().trim());
        const avg = dayCount > 0 ? +(qty / dayCount).toFixed(1) : 0;
        if (!std) return { proteinType, qty, avgQtyPerDay: avg, totalUsed: null, portionSize: null, portionUnit: null, ingredientName: null };
        return {
            proteinType, qty, avgQtyPerDay: avg,
            totalUsed:      qty * std.portionSize,
            portionSize:    std.portionSize,
            portionUnit:    std.portionUnit,
            ingredientName: std.ingredientName,
        };
    }
    void allProteinNames;

    const proteinTotals = [...mainByType.entries()]
        .map(([name, qty]) => withPortion(name, qty))
        .sort((a, b) => b.qty - a.qty);
    const extraTotals   = [...extraByType.entries()]
        .map(([name, qty]) => withPortion(name, qty))
        .sort((a, b) => b.qty - a.qty);

    const sortByDish = (a: { category: string; dish: string; qty: number }, b: { category: string; dish: string; qty: number }) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        if (a.dish     !== b.dish)     return a.dish.localeCompare(b.dish);
        return b.qty - a.qty;
    };
    const mainProteinByDish  = [...mainByDish.values()].sort(sortByDish);
    const extraProteinByDish = [...extraByDish.values()].sort(sortByDish);
    const mainTotal  = proteinTotals.reduce((s, p) => s + p.qty, 0);
    const extraTotal = extraTotals.reduce((s, p) => s + p.qty, 0);

    // 7. Overall totals
    const totalQty         = [...itemMap.values()].reduce((s, i) => s + i.qtySold, 0);
    const totalNetSales    = [...itemMap.values()].reduce((s, i) => s + i.netSales, 0);
    const totalGrossSales  = [...itemMap.values()].reduce((s, i) => s + i.grossSales, 0);
    const totalRefundQty   = [...itemMap.values()].reduce((s, i) => s + i.refundQty, 0);
    const totalRefundAmt   = [...itemMap.values()].reduce((s, i) => s + i.refundAmount, 0);

    const allDates = [...trendMap.keys()].sort();

    return NextResponse.json({
        uploadIds,
        dayCount,
        uploadCount:  uploads.length,
        periodFrom:   allDates[0]  ?? fromStr,
        periodTo:     allDates[allDates.length - 1] ?? toStr,
        totals: {
            qty:          totalQty,
            grossSales:   totalGrossSales.toFixed(2),
            netSales:     totalNetSales.toFixed(2),
            refundQty:    totalRefundQty,
            refundAmount: totalRefundAmt.toFixed(2),
            avgSalesPerDay: dayCount > 0 ? +(totalNetSales / dayCount).toFixed(2) : 0,
            avgQtyPerDay:   dayCount > 0 ? +(totalQty / dayCount).toFixed(1) : 0,
        },
        topItems,
        categoryBreakdown,
        dailyTrend,
        proteinTotals,
        // Extended ingredient summary (CR 2.2/2.3 range-aware)
        ingredientSummary: {
            mainProtein:  { byType: proteinTotals, byDish: mainProteinByDish,  total: mainTotal },
            extraProtein: { byType: extraTotals,   byDish: extraProteinByDish, total: extraTotal },
            hasProteinData: proteinTotals.length > 0 || extraTotals.length > 0,
        },
    });
}
