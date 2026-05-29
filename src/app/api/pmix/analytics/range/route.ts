/**
 * GET /api/pmix/analytics/range?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Aggregates PMIX data across all uploads in the date range.
 * Hybrid protein classifier: modifier-based OR item-rule-based.
 *
 * Returns:
 *   - uploadIds[], dayCount, uploadCount, periodFrom/To
 *   - totals, topItems[], categoryBreakdown[], dailyTrend[]
 *   - ingredientSummary { mainProtein, extraProtein, desserts, uncategorized, hasProteinData }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

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

    // 1. Uploads in range
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true, periodLabel: true, totalQty: true, totalSales: true },
        orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
    });

    const emptyIngSum = {
        mainProtein:    { byType: [], byDish: [], total: 0, groupNames: [] },
        extraProtein:   { byType: [], byDish: [], total: 0, groupNames: [] },
        desserts:       { byItem: [], total: 0 },
        uncategorized:  [],
        hasProteinData: false,
    };

    if (uploads.length === 0) {
        return NextResponse.json({
            uploadIds: [], dayCount: 0, uploadCount: 0,
            periodFrom: fromStr, periodTo: toStr,
            totals: { qty: 0, grossSales: "0.00", netSales: "0.00", refundQty: 0, refundAmount: "0.00", avgSalesPerDay: 0, avgQtyPerDay: 0 },
            topItems: [], categoryBreakdown: [], dailyTrend: [], proteinTotals: [],
            ingredientSummary: emptyIngSum,
            message: "No uploads found in this date range",
        });
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 2. All items + modifiers
    const items = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds } },
        include: { modifiers: true },
    });

    // 3. Item rules (sorted priority desc)
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 4. Portion standards
    const standards = await db.portionStandard.findMany({
        where:   { type: { in: ["modifier", "base"] } },
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

    const dayCount = new Set(
        uploads.map((u: { businessDate: Date | null; uploadedAt: Date }) =>
            (u.businessDate ?? u.uploadedAt).toISOString().slice(0, 10)
        )
    ).size;

    // ─── Aggregate top items / category breakdown ─────────────────────────────
    const itemMap = new Map<string, {
        itemName: string; category: string;
        qtySold: number; netSales: number; grossSales: number;
        refundQty: number; refundAmount: number; discountAmount: number;
    }>();
    for (const item of items) {
        const key = `${item.category}|||${item.itemName}`;
        const ex  = itemMap.get(key);
        if (ex) {
            ex.qtySold        += Number(item.qtySold);
            ex.netSales       += Number(item.netSales);
            ex.grossSales     += Number(item.grossSales);
            ex.refundQty      += Number(item.refundQty);
            ex.refundAmount   += Number(item.refundAmount);
            ex.discountAmount += Number(item.discountAmount);
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

    // ─── Daily trend ──────────────────────────────────────────────────────────
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

    // ─── Protein / Dessert classification ─────────────────────────────────────
    const mainByType      = new Map<string, number>();
    const extraByType     = new Map<string, number>();
    const mainByDish      = new Map<string, { category: string; dish: string; proteinType: string; qty: number }>();
    const extraByDish     = new Map<string, { category: string; dish: string; proteinType: string; qty: number }>();
    const dessertItems    = new Map<string, number>();
    const beverageByGroup = new Map<string, number>();
    const uncatMap        = new Map<string, { itemName: string; category: string; qty: number }>();

    const mainGroupNames  = new Set<string>();
    const extraGroupNames = new Set<string>();
    const beverageCatSet  = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));

    for (const item of items) {
        const dishName = item.itemName as string;
        const category = (item.category as string) ?? "";
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        if (beverageCatSet.has(category.toLowerCase())) {
            beverageByGroup.set(category, (beverageByGroup.get(category) ?? 0) + qty);
            continue;
        }

        if (hasProteinModifier(mods)) {
            // Modifier-based path
            for (const mod of mods) {
                const grp    = (mod.modifierGroup ?? "").toLowerCase();
                const name   = (mod.modifier ?? "").trim();
                const modQty = Number(mod.qtySold ?? 0);
                if (!name) continue;
                const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
                const isMain  = grp.includes("protein") && !isExtra;
                const dKey    = `${dishName}|||${name}`;

                // Apply exclusion rules to modifier names too (e.g. "Veg & Tofu" → excluded)
                if (isMain || isExtra) {
                    const modClass = classifyItem(name, rules);
                    if (modClass?.category === "excluded") continue;
                }

                if (isMain) {
                    mainGroupNames.add(mod.modifierGroup);
                    mainByType.set(name, (mainByType.get(name) ?? 0) + modQty);
                    const ex = mainByDish.get(dKey);
                    if (ex) ex.qty += modQty;
                    else    mainByDish.set(dKey, { category, dish: dishName, proteinType: name, qty: modQty });
                } else if (isExtra) {
                    extraGroupNames.add(mod.modifierGroup);
                    extraByType.set(name, (extraByType.get(name) ?? 0) + modQty);
                    const ex = extraByDish.get(dKey);
                    if (ex) ex.qty += modQty;
                    else    extraByDish.set(dKey, { category, dish: dishName, proteinType: name, qty: modQty });
                }
            }
        } else {
            // Item-rule path
            const result = classifyItem(dishName, rules);
            if (!result) {
                const ex = uncatMap.get(dishName);
                if (ex) ex.qty += qty;
                else    uncatMap.set(dishName, { itemName: dishName, category, qty });
                continue;
            }
            if (result.category === "excluded") continue;
            if (result.category === "dessert") {
                dessertItems.set(dishName, (dessertItems.get(dishName) ?? 0) + qty);
            } else if (result.category === "main_protein") {
                mainByType.set(result.label, (mainByType.get(result.label) ?? 0) + qty);
                const dKey = `${dishName}|||${result.label}`;
                const ex   = mainByDish.get(dKey);
                if (ex) ex.qty += qty;
                else    mainByDish.set(dKey, { category, dish: dishName, proteinType: result.label, qty });
            } else if (result.category === "extra_protein") {
                extraByType.set(result.label, (extraByType.get(result.label) ?? 0) + qty);
                const dKey = `${dishName}|||${result.label}`;
                const ex   = extraByDish.get(dKey);
                if (ex) ex.qty += qty;
                else    extraByDish.set(dKey, { category, dish: dishName, proteinType: result.label, qty });
            }
        }
    }

    // ─── Sort helpers ─────────────────────────────────────────────────────────
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

    const sortByDish = (a: { category: string; dish: string; qty: number }, b: { category: string; dish: string; qty: number }) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        if (a.dish     !== b.dish)     return a.dish.localeCompare(b.dish);
        return b.qty - a.qty;
    };

    const proteinTotals  = [...mainByType.entries()].map(([n, q]) => withPortion(n, q)).sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));
    const extraTotals    = [...extraByType.entries()].map(([n, q]) => withPortion(n, q)).sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));
    const mainTotal      = proteinTotals.reduce((s, p) => s + p.qty, 0);
    const extraTotal     = extraTotals.reduce((s, p) => s + p.qty, 0);

    const dessertArr     = [...dessertItems.entries()].map(([itemName, qty]) => ({
        itemName,
        qty,
        avgQtyPerDay: dayCount > 0 ? +(qty / dayCount).toFixed(1) : 0,
    })).sort((a, b) => b.qty - a.qty);
    const dessertTotal   = dessertArr.reduce((s, d) => s + d.qty, 0);

    const beverageArr: { group: string; qty: number; avgQtyPerDay: number }[] = BEVERAGE_CATEGORIES
        .filter(cat => beverageByGroup.has(cat))
        .map(cat => ({
            group: cat as string,
            qty:   beverageByGroup.get(cat)!,
            avgQtyPerDay: dayCount > 0 ? +(beverageByGroup.get(cat)! / dayCount).toFixed(1) : 0,
        }));
    for (const [cat, qty] of beverageByGroup.entries()) {
        if (!beverageArr.find(b => b.group.toLowerCase() === cat.toLowerCase())) {
            beverageArr.push({ group: cat, qty, avgQtyPerDay: dayCount > 0 ? +(qty / dayCount).toFixed(1) : 0 });
        }
    }
    const beverageTotal = beverageArr.reduce((s, b) => s + b.qty, 0);

    const uncategorized  = [...uncatMap.values()].sort((a, b) => b.qty - a.qty);

    // ─── Overall totals ───────────────────────────────────────────────────────
    const totalQty        = [...itemMap.values()].reduce((s, i) => s + i.qtySold, 0);
    const totalNetSales   = [...itemMap.values()].reduce((s, i) => s + i.netSales, 0);
    const totalGrossSales = [...itemMap.values()].reduce((s, i) => s + i.grossSales, 0);
    const totalRefundQty  = [...itemMap.values()].reduce((s, i) => s + i.refundQty, 0);
    const totalRefundAmt  = [...itemMap.values()].reduce((s, i) => s + i.refundAmount, 0);
    const allDates        = [...trendMap.keys()].sort();

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
        ingredientSummary: {
            mainProtein:  {
                byType:     proteinTotals,
                byDish:     [...mainByDish.values()].sort(sortByDish),
                total:      mainTotal,
                groupNames: [...mainGroupNames],
            },
            extraProtein: {
                byType:     extraTotals,
                byDish:     [...extraByDish.values()].sort(sortByDish),
                total:      extraTotal,
                groupNames: [...extraGroupNames],
            },
            desserts:      { byItem: dessertArr, total: dessertTotal },
            beverages:     { byGroup: beverageArr, total: beverageTotal },
            uncategorized,
            hasProteinData: proteinTotals.length > 0 || extraTotals.length > 0,
        },
    });
}
