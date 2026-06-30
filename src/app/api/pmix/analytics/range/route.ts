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
import { requireBranch, isBranchContext } from "@/lib/branch";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { BEVERAGE_CATEGORIES, classifyPosCategory } from "@/lib/beverage-categories";
import { CURRY_GROUPS, matchCurryGroup } from "@/lib/curry-categories";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

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
            branchId,
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
        where:   { uploadId: { in: uploadIds }, branchId },
        include: { modifiers: true },
    });

    // 3. Item rules (sorted priority desc)
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true, branchId },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 4. Portion standards
    const standards = await db.portionStandard.findMany({
        where:   { type: { in: ["modifier", "base"] }, branchId },
        include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } },
    });
    type StdVal = { portionSize: number; portionUnit: string; ingredientName: string; ingredientId: string };
    const stdByName    = new Map<string, StdVal>();
    const stdByIngName = new Map<string, StdVal>();
    for (const s of standards) {
        const v: StdVal = {
            portionSize:    Number(s.portionSize),
            portionUnit:    s.portionUnit,
            ingredientName: s.ingredient?.name ?? s.itemName,
            ingredientId:   s.ingredientId,
        };
        stdByName.set(String(s.itemName).toLowerCase().trim(), v);
        const ingKey = (s.ingredient?.name ?? "").toLowerCase().trim();
        if (ingKey && !stdByIngName.has(ingKey)) stdByIngName.set(ingKey, v);
    }
    const lookupStd = (proteinType: string) => {
        const k = proteinType.toLowerCase().trim();
        return stdByName.get(k) ?? stdByIngName.get(k);
    };

    const dateSet = new Set(
        uploads.map((u: { businessDate: Date | null; uploadedAt: Date }) =>
            (u.businessDate ?? u.uploadedAt).toISOString().slice(0, 10)
        )
    );
    const dayCount = dateSet.size;

    // Pre-build uploadId → day-of-week (Mon=0 … Sun=6) from the uploads list
    const uploadDowMap = new Map<string, number>();
    for (const u of uploads) {
        const date = (u.businessDate ?? u.uploadedAt) as Date;
        uploadDowMap.set(u.id as string, (date.getDay() + 6) % 7); // Sun=0 → Mon=0
    }

    // ─── Aggregate top items / category breakdown ─────────────────────────────
    const itemMap = new Map<string, {
        itemName: string; category: string;
        qtySold: number; netSales: number; grossSales: number;
        refundQty: number; refundAmount: number; discountAmount: number;
        byDow: number[]; // [Mon, Tue, Wed, Thu, Fri, Sat, Sun]
    }>();
    for (const item of items) {
        const key = `${item.category}|||${item.itemName}`;
        const ex  = itemMap.get(key);
        const qty = Number(item.qtySold);
        const dow = uploadDowMap.get(item.uploadId as string) ?? 0;
        if (ex) {
            ex.qtySold        += qty;
            ex.netSales       += Number(item.netSales);
            ex.grossSales     += Number(item.grossSales);
            ex.refundQty      += Number(item.refundQty);
            ex.refundAmount   += Number(item.refundAmount);
            ex.discountAmount += Number(item.discountAmount);
            ex.byDow[dow]     += qty;
        } else {
            const byDow = [0, 0, 0, 0, 0, 0, 0];
            byDow[dow] = qty;
            itemMap.set(key, {
                itemName:       item.itemName as string,
                category:       item.category  as string,
                qtySold:        qty,
                netSales:       Number(item.netSales),
                grossSales:     Number(item.grossSales),
                refundQty:      Number(item.refundQty),
                refundAmount:   Number(item.refundAmount),
                discountAmount: Number(item.discountAmount),
                byDow,
            });
        }
    }

    const topItems = [...itemMap.values()]
        .sort((a, b) => b.qtySold - a.qtySold)
        .slice(0, 30)
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
    const curryByGroup    = new Map<string, number>();
    const uncatMap        = new Map<string, { itemName: string; category: string; qty: number }>();

    const mainGroupNames  = new Set<string>();
    const extraGroupNames = new Set<string>();
    const beverageCatSet  = { has: (c: string) => classifyPosCategory(c) !== null };

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

        // Curry detection runs in parallel with protein/dessert classification
        const curryGroup = matchCurryGroup(dishName);
        if (curryGroup) {
            curryByGroup.set(curryGroup, (curryByGroup.get(curryGroup) ?? 0) + qty);
        }

        // Does the MAIN protein come from a modifier "Choice of Protein" group?
        // (An "Extra …" group alone does NOT count — the main protein then still
        //  lives in the dish name, e.g. "Duck Panang" + "Extra Protein".)
        const mainFromModifier = hasMainProteinModifier(mods);

        // (1) Always process modifiers so EXTRA add-ons — and modifier-chosen
        //     main proteins — are counted regardless of how the dish is named.
        for (const mod of mods) {
            const grp    = (mod.modifierGroup ?? "").toLowerCase();
            const name   = (mod.modifier ?? "").trim();
            const modQty = Number(mod.qtySold ?? 0);
            if (!name) continue;
            const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
            const isMain  = grp.includes("protein") && !isExtra;
            if (!isMain && !isExtra) continue;
            const dKey = `${dishName}|||${name}`;

            // Apply exclusion rules to modifier names too (e.g. "Veg & Tofu" → excluded)
            const modClass = classifyItem(name, rules);
            if (modClass?.category === "excluded") continue;

            if (isMain) {
                mainGroupNames.add(mod.modifierGroup);
                mainByType.set(name, (mainByType.get(name) ?? 0) + modQty);
                const ex = mainByDish.get(dKey);
                if (ex) ex.qty += modQty;
                else    mainByDish.set(dKey, { category, dish: dishName, proteinType: name, qty: modQty });
            } else {
                extraGroupNames.add(mod.modifierGroup);
                extraByType.set(name, (extraByType.get(name) ?? 0) + modQty);
                const ex = extraByDish.get(dKey);
                if (ex) ex.qty += modQty;
                else    extraByDish.set(dKey, { category, dish: dishName, proteinType: name, qty: modQty });
            }
        }

        // (2) Classify the dish NAME for its main protein / dessert ONLY when the
        //     main protein is not chosen via a modifier group (else double-count).
        if (!mainFromModifier) {
            const result = classifyItem(dishName, rules);
            if (!result) {
                const ex = uncatMap.get(dishName);
                if (ex) ex.qty += qty;
                else    uncatMap.set(dishName, { itemName: dishName, category, qty });
            } else if (result.category === "excluded") {
                // skip
            } else if (result.category === "dessert") {
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
        const std = lookupStd(proteinType);
        const avg = dayCount > 0 ? +(qty / dayCount).toFixed(1) : 0;
        if (!std) return { proteinType, qty, avgQtyPerDay: avg, totalUsed: null as number | null, portionSize: null as number | null, portionUnit: null as string | null, ingredientName: null as string | null, extraUsed: 0 };
        return {
            proteinType, qty, avgQtyPerDay: avg,
            totalUsed:      qty * std.portionSize as number | null,
            portionSize:    std.portionSize as number | null,
            portionUnit:    std.portionUnit as string | null,
            ingredientName: std.ingredientName as string | null,
            extraUsed:      0,
        };
    }

    const sortByDish = (a: { category: string; dish: string; qty: number }, b: { category: string; dish: string; qty: number }) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        if (a.dish     !== b.dish)     return a.dish.localeCompare(b.dish);
        return b.qty - a.qty;
    };

    const proteinTotals  = [...mainByType.entries()].map(([n, q]) => withPortion(n, q)).sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));
    const extraTotals    = [...extraByType.entries()].map(([n, q]) => withPortion(n, q)).sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));

    // Fold each "Extra <Protein>" add-on's INGREDIENT USAGE into the matching
    // main protein (e.g. "Extra Chicken" → "Chicken"). Orders stay main-only;
    // only `extraUsed` is set so the UI shows a combined "Total We Use".
    {
        const extraAgg = new Map<string, { used: number; unit: string; display: string }>();
        for (const e of extraTotals) {
            if (e.totalUsed == null || !e.portionUnit) continue;
            const display = e.proteinType.replace(/^extra\s+/i, "").trim();
            const base    = display.toLowerCase();
            const cur     = extraAgg.get(base);
            if (cur && cur.unit === e.portionUnit) cur.used += e.totalUsed;
            else if (!cur)                          extraAgg.set(base, { used: e.totalUsed, unit: e.portionUnit, display });
        }
        const consumed = new Set<string>();
        for (const p of proteinTotals) {
            const key = p.proteinType.toLowerCase().trim();
            const ex  = extraAgg.get(key);
            if (ex) {
                consumed.add(key);
                p.extraUsed = (p.portionUnit === null || ex.unit === p.portionUnit) ? +ex.used.toFixed(3) : 0;
            } else {
                p.extraUsed = 0;
            }
        }
        // Proteins sold ONLY as an Extra add-on → surface as their own main row
        // (0 main orders; Total We Use = the extra usage).
        for (const [base, ex] of extraAgg) {
            if (consumed.has(base)) continue;
            const std = stdByName.get(base) ?? stdByIngName.get(base);
            proteinTotals.push({
                proteinType:    ex.display,
                qty:            0,
                avgQtyPerDay:   0,
                totalUsed:      0,
                portionSize:    std ? std.portionSize : null,
                portionUnit:    ex.unit,
                ingredientName: std ? std.ingredientName : null,
                extraUsed:      +ex.used.toFixed(3),
            });
        }
        proteinTotals.sort((a, b) => (b.qty + (b.extraUsed ?? 0)) - (a.qty + (a.extraUsed ?? 0)) || a.proteinType.localeCompare(b.proteinType));
    }

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

    // Curry totals — preserve canonical order from CURRY_GROUPS
    const curryArr: { group: string; qty: number; avgQtyPerDay: number }[] = CURRY_GROUPS
        .filter(g => curryByGroup.has(g.label))
        .map(g => ({
            group:        g.label,
            qty:          curryByGroup.get(g.label)!,
            avgQtyPerDay: dayCount > 0 ? +(curryByGroup.get(g.label)! / dayCount).toFixed(1) : 0,
        }));
    const curryTotal = curryArr.reduce((s, c) => s + c.qty, 0);

    const uncategorized  = [...uncatMap.values()].sort((a, b) => b.qty - a.qty);

    // ─── Overall totals ───────────────────────────────────────────────────────
    const totalQty        = [...itemMap.values()].reduce((s, i) => s + i.qtySold, 0);
    const totalNetSales   = [...itemMap.values()].reduce((s, i) => s + i.netSales, 0);
    const totalGrossSales = [...itemMap.values()].reduce((s, i) => s + i.grossSales, 0);
    const totalRefundQty  = [...itemMap.values()].reduce((s, i) => s + i.refundQty, 0);
    const totalRefundAmt  = [...itemMap.values()].reduce((s, i) => s + i.refundAmount, 0);
    const allDates        = [...trendMap.keys()].sort();

    // ─── Quality & Loss: items with refunds / discounts ─────────────────────────
    const lossItems = [...itemMap.values()]
        .filter(i => i.refundAmount > 0 || i.refundQty > 0 || i.discountAmount > 0)
        .map(i => ({
            itemName:       i.itemName,
            category:       i.category,
            qtySold:        i.qtySold,
            refundQty:      i.refundQty,
            refundAmount:   +i.refundAmount.toFixed(2),
            discountAmount: +i.discountAmount.toFixed(2),
        }))
        .sort((a, b) => (b.refundAmount + b.discountAmount) - (a.refundAmount + a.discountAmount));

    // ─── Kitchen Prep: modifier mise-en-place totals (group → modifier → qty) ───
    const modPrepMap = new Map<string, { group: string; modifier: string; qty: number }>();
    for (const item of items) {
        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;
        for (const m of mods) {
            const group = (m.modifierGroup ?? "").trim();
            const name  = (m.modifier ?? "").trim();
            if (!group || !name) continue;
            const k  = `${group}|||${name}`;
            const ex = modPrepMap.get(k);
            if (ex) ex.qty += Number(m.qtySold ?? 0);
            else    modPrepMap.set(k, { group, modifier: name, qty: Number(m.qtySold ?? 0) });
        }
    }
    const modifierPrep = [...modPrepMap.values()]
        .filter(m => m.qty > 0)
        .sort((a, b) => a.group.localeCompare(b.group) || b.qty - a.qty)
        .map(m => ({ ...m, avgQtyPerDay: dayCount > 0 ? +(m.qty / dayCount).toFixed(1) : 0 }));

    // ─── Menu Engineering (BCG matrix) ──────────────────────────────────────────
    // Popularity = qty vs avg; Profitability proxy = net sales per unit vs avg
    const bcgRaw   = [...itemMap.values()];
    const bcgAvgQty   = bcgRaw.length > 0 ? bcgRaw.reduce((s, i) => s + i.qtySold, 0) / bcgRaw.length : 0;
    const bcgPriced   = bcgRaw.filter(i => i.qtySold > 0);
    const bcgAvgPrice = bcgPriced.length > 0 ? bcgPriced.reduce((s, i) => s + i.netSales / i.qtySold, 0) / bcgPriced.length : 0;
    const classifyBcg = (qty: number, up: number): "Star" | "Plowhorse" | "Puzzle" | "Dog" => {
        const hiPop = qty >= bcgAvgQty, hiProf = up >= bcgAvgPrice;
        return hiPop && hiProf ? "Star" : hiPop && !hiProf ? "Plowhorse" : !hiPop && hiProf ? "Puzzle" : "Dog";
    };
    const bcgItems = bcgRaw.map(i => {
        const unitPrice = i.qtySold > 0 ? i.netSales / i.qtySold : 0;
        return {
            itemName: i.itemName, category: i.category,
            qtySold: i.qtySold, netSales: +i.netSales.toFixed(2),
            unitPrice: +unitPrice.toFixed(2), quadrant: classifyBcg(i.qtySold, unitPrice),
        };
    }).sort((a, b) => b.qtySold - a.qtySold);
    const bcg = {
        items:   bcgItems,
        summary: {
            Star:      bcgItems.filter(i => i.quadrant === "Star").length,
            Plowhorse: bcgItems.filter(i => i.quadrant === "Plowhorse").length,
            Puzzle:    bcgItems.filter(i => i.quadrant === "Puzzle").length,
            Dog:       bcgItems.filter(i => i.quadrant === "Dog").length,
            avgQty:    +bcgAvgQty.toFixed(1),
            avgPrice:  +bcgAvgPrice.toFixed(2),
        },
    };

    // ─── BOM: recipe-level ingredient consumption across the range ──────────────
    const recipeQty = new Map<string, number>();   // recipeId → total qty sold
    for (const it of items) {
        const rid = (it as { recipeId?: string | null }).recipeId;
        if (!rid) continue;
        recipeQty.set(rid, (recipeQty.get(rid) ?? 0) + Number(it.qtySold ?? 0));
    }
    const bomRecipeIds = [...recipeQty.keys()];
    const recipeIngredients = bomRecipeIds.length > 0
        ? await db.recipeIngredient.findMany({
            where:   { recipeId: { in: bomRecipeIds }, branchId },
            include: {
                ingredient: { select: { id: true, name: true, recipeUnit: true } },
                recipe:     { select: { id: true, yieldAmount: true } },
            },
        })
        : [];
    const consMap = new Map<string, { ingredientId: string; ingredientName: string; unit: string; totalQty: number }>();
    for (const rid of bomRecipeIds) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const riList = recipeIngredients.filter((ri: any) => ri.recipeId === rid);
        const yieldAmt = Number(riList[0]?.recipe?.yieldAmount ?? 1) || 1;
        const soldQty  = recipeQty.get(rid) ?? 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const ri of riList as any[]) {
            const used = (Number(ri.quantity) / yieldAmt) * soldQty;
            const ex = consMap.get(ri.ingredientId);
            if (ex) ex.totalQty += used;
            else consMap.set(ri.ingredientId, {
                ingredientId:   ri.ingredientId,
                ingredientName: ri.ingredient.name,
                unit:           ri.ingredient.recipeUnit,
                totalQty:       used,
            });
        }
    }
    const bomConsumption = [...consMap.values()]
        .map(c => ({ ...c, totalQty: +c.totalQty.toFixed(3), avgPerDay: dayCount > 0 ? +(c.totalQty / dayCount).toFixed(3) : 0 }))
        .sort((a, b) => b.totalQty - a.totalQty);
    const bom = { consumption: bomConsumption, linkedRecipes: bomRecipeIds.length };

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
        lossItems,
        lossTotals: { refundQty: totalRefundQty, refundAmount: +totalRefundAmt.toFixed(2) },
        modifierPrep,
        bcg,
        bom,
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
            curries:       { byGroup: curryArr,   total: curryTotal },
            uncategorized,
            hasProteinData: proteinTotals.length > 0 || extraTotals.length > 0,
        },
    });
}
