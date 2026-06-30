/**
 * GET /api/pmix/ingredient-summary?uploadId=X
 *
 * Hybrid classifier:
 *   1. Items WITH protein/extra modifier groups → existing modifier logic (unchanged)
 *   2. Items WITHOUT those modifiers           → PmixItemRule engine (item-name matching)
 *
 * Returns:
 *   - mainProtein   { byType[], byDish[], total, groupNames[] }
 *   - extraProtein  { byType[], byDish[], total, groupNames[] }
 *   - desserts      { byItem[], total }
 *   - uncategorized { items[] }  — items with no rule match (for admin review)
 *   - hasProteinData
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
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Upload header
    const upload = await db.pmixUpload.findFirst({
        where:  { id: uploadId, branchId },
        select: { id: true, periodLabel: true, uploadedAt: true },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 2. All items + modifiers
    const pmixItems = await db.pmixItem.findMany({
        where:   { uploadId, branchId },
        include: { modifiers: true },
    });

    // 3. Portion standards
    const standards = await db.portionStandard.findMany({
        where:   { branchId },
        include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } },
    });
    type StdVal = { ingredientName: string; portionSize: number; portionUnit: string; ingredientId: string };
    const stdByName    = new Map<string, StdVal>();   // keyed by the standard's itemName
    const stdByIngName = new Map<string, StdVal>();   // fallback: keyed by the ingredient's name
    for (const s of standards) {
        if (s.type === "modifier" || s.type === "base") {
            const v: StdVal = {
                ingredientName: s.ingredient?.name ?? s.itemName,
                portionSize:    Number(s.portionSize),
                portionUnit:    s.portionUnit,
                ingredientId:   s.ingredientId,
            };
            stdByName.set(String(s.itemName).toLowerCase().trim(), v);
            const ingKey = (s.ingredient?.name ?? "").toLowerCase().trim();
            if (ingKey && !stdByIngName.has(ingKey)) stdByIngName.set(ingKey, v);
        }
    }
    const lookupStd = (proteinType: string) => {
        const k = proteinType.toLowerCase().trim();
        return stdByName.get(k) ?? stdByIngName.get(k);
    };

    // 4. Item rules (sorted priority desc)
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true, branchId },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // ─── Accumulators ─────────────────────────────────────────────────────────
    interface ByType { proteinType: string; qty: number; totalUsed: number | null; portionSize: number | null; portionUnit: string | null; ingredientName: string | null; extraUsed: number }
    interface ByDish  { category: string; dish: string; proteinType: string; qty: number }
    interface DessertItem { itemName: string; qty: number }

    const mainByType    = new Map<string, number>();
    const mainByDish    = new Map<string, ByDish>();
    const extraByType   = new Map<string, number>();
    const extraByDish   = new Map<string, ByDish>();
    const dessertItems  = new Map<string, number>();      // itemName → total qty
    const beverageByGroup = new Map<string, number>();    // POS category → total qty
    const curryByGroup    = new Map<string, number>();    // curry group label → total qty
    const uncategorized: { itemName: string; category: string; qty: number }[] = [];

    const beverageCatSet = { has: (c: string) => classifyPosCategory(c) !== null };

    const mainGroupNames  = new Set<string>();
    const extraGroupNames = new Set<string>();

    for (const item of pmixItems) {
        const dishName = item.itemName as string;
        const category = (item.category as string) ?? "";
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        // ── Beverage items (by POS category) — skip other classification ─────
        if (beverageCatSet.has(category.toLowerCase())) {
            beverageByGroup.set(category, (beverageByGroup.get(category) ?? 0) + qty);
            continue;
        }

        // ── Curry detection runs in PARALLEL — same item can also count as
        //    protein/extra/dessert downstream (e.g. "Green Curry - Chicken")
        const curryGroup = matchCurryGroup(dishName);
        if (curryGroup) {
            curryByGroup.set(curryGroup, (curryByGroup.get(curryGroup) ?? 0) + qty);
        }

        // Main protein from a "Choice of Protein" modifier group? (an "Extra …"
        // group alone does not count — protein then still lives in the dish name)
        const mainFromModifier = hasMainProteinModifier(mods);

        // (1) Always tally modifiers so EXTRA add-ons (and modifier-chosen mains)
        //     are counted regardless of how the dish name is classified.
        for (const mod of mods) {
            const grp    = (mod.modifierGroup ?? "").toLowerCase();
            const name   = mod.modifier ?? "";
            const modQty = Number(mod.qtySold ?? 0);
            const isExtra   = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
            const isMainPro = grp.includes("protein") && !isExtra;
            if (!isMainPro && !isExtra) continue;

            // Apply exclusion rules to modifier names too (e.g. "Veg & Tofu" → excluded)
            const modClass = classifyItem(name, rules);
            if (modClass?.category === "excluded") continue;

            if (isMainPro) {
                mainGroupNames.add(mod.modifierGroup);
                mainByType.set(name, (mainByType.get(name) ?? 0) + modQty);
                const k = `${dishName}|||${name}`;
                const ex = mainByDish.get(k);
                if (ex) ex.qty += modQty;
                else    mainByDish.set(k, { category, dish: dishName, proteinType: name, qty: modQty });
            } else {
                extraGroupNames.add(mod.modifierGroup);
                extraByType.set(name, (extraByType.get(name) ?? 0) + modQty);
                const k = `${dishName}|||${name}`;
                const ex = extraByDish.get(k);
                if (ex) ex.qty += modQty;
                else    extraByDish.set(k, { category, dish: dishName, proteinType: name, qty: modQty });
            }
        }

        // (2) Classify the dish NAME for its main protein / dessert only when the
        //     main protein is not chosen via a modifier group (else double-count).
        if (!mainFromModifier) {
            const result = classifyItem(dishName, rules);
            if (!result) {
                // Unknown — surface for admin review
                const existing = uncategorized.find(u => u.itemName === dishName);
                if (existing) existing.qty += qty;
                else uncategorized.push({ itemName: dishName, category, qty });
                continue;
            }
            if (result.category === "excluded") continue;

            if (result.category === "dessert") {
                dessertItems.set(dishName, (dessertItems.get(dishName) ?? 0) + qty);
            } else if (result.category === "main_protein") {
                mainByType.set(result.label, (mainByType.get(result.label) ?? 0) + qty);
                const k  = `${dishName}|||${result.label}`;
                const ex = mainByDish.get(k);
                if (ex) ex.qty += qty;
                else    mainByDish.set(k, { category, dish: dishName, proteinType: result.label, qty });
            } else if (result.category === "extra_protein") {
                extraByType.set(result.label, (extraByType.get(result.label) ?? 0) + qty);
                const k  = `${dishName}|||${result.label}`;
                const ex = extraByDish.get(k);
                if (ex) ex.qty += qty;
                else    extraByDish.set(k, { category, dish: dishName, proteinType: result.label, qty });
            }
        }
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────
    function withPortion(proteinType: string, qty: number): ByType {
        const std = lookupStd(proteinType);
        if (!std) return { proteinType, qty, totalUsed: null, portionSize: null, portionUnit: null, ingredientName: null, extraUsed: 0 };
        return {
            proteinType,
            qty,
            totalUsed:      qty * std.portionSize,
            portionSize:    std.portionSize,
            portionUnit:    std.portionUnit,
            ingredientName: std.ingredientName,
            extraUsed:      0,
        };
    }

    /**
     * Fold each "Extra <Protein>" add-on's INGREDIENT USAGE into the matching
     * main protein (e.g. "Extra Chicken" → "Chicken"). Orders stay main-only;
     * only `extraUsed` is populated so the UI can show a combined "Total We Use".
     * Units must match to be additive.
     */
    function foldExtrasIntoMain(main: ByType[], extra: ByType[]) {
        const extraAgg = new Map<string, { used: number; unit: string; display: string }>();
        for (const e of extra) {
            if (e.totalUsed == null || !e.portionUnit) continue;
            const display = e.proteinType.replace(/^extra\s+/i, "").trim();
            const base    = display.toLowerCase();
            const cur     = extraAgg.get(base);
            if (cur && cur.unit === e.portionUnit) cur.used += e.totalUsed;
            else if (!cur)                          extraAgg.set(base, { used: e.totalUsed, unit: e.portionUnit, display });
        }
        const consumed = new Set<string>();
        for (const p of main) {
            const key = p.proteinType.toLowerCase().trim();
            const ex  = extraAgg.get(key);
            if (ex) {
                consumed.add(key);
                p.extraUsed = (p.portionUnit === null || ex.unit === p.portionUnit) ? +ex.used.toFixed(3) : 0;
            } else {
                p.extraUsed = 0;
            }
        }
        // Proteins sold ONLY as an Extra add-on → surface as their own main row.
        for (const [base, ex] of extraAgg) {
            if (consumed.has(base)) continue;
            const std = stdByName.get(base);
            main.push({
                proteinType:    ex.display,
                qty:            0,
                totalUsed:      0,
                portionSize:    std ? std.portionSize : null,
                portionUnit:    ex.unit,
                ingredientName: std ? std.ingredientName : null,
                extraUsed:      +ex.used.toFixed(3),
            });
        }
        main.sort((a, b) => (b.qty + (b.extraUsed ?? 0)) - (a.qty + (a.extraUsed ?? 0)) || a.proteinType.localeCompare(b.proteinType));
    }

    const sortByDish = (a: ByDish, b: ByDish) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        if (a.dish     !== b.dish)     return a.dish.localeCompare(b.dish);
        return b.qty - a.qty;
    };

    const mainByTypeArr: ByType[] = [...mainByType.entries()]
        .map(([t, q]) => withPortion(t, q))
        .sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));
    const mainTotal = mainByTypeArr.reduce((s, x) => s + x.qty, 0);

    const extraByTypeArr: ByType[] = [...extraByType.entries()]
        .map(([t, q]) => withPortion(t, q))
        .sort((a, b) => b.qty - a.qty || a.proteinType.localeCompare(b.proteinType));
    const extraTotal = extraByTypeArr.reduce((s, x) => s + x.qty, 0);

    // Combine extra add-on usage into the matching main protein's "Total We Use"
    foldExtrasIntoMain(mainByTypeArr, extraByTypeArr);

    const dessertArr: DessertItem[] = [...dessertItems.entries()]
        .map(([itemName, qty]) => ({ itemName, qty }))
        .sort((a, b) => b.qty - a.qty);
    const dessertTotal = dessertArr.reduce((s, d) => s + d.qty, 0);

    // Preserve canonical ordering from BEVERAGE_CATEGORIES, then sort by qty desc
    const beverageArr: { group: string; qty: number }[] = BEVERAGE_CATEGORIES
        .filter(cat => beverageByGroup.has(cat))
        .map(cat => ({ group: cat as string, qty: beverageByGroup.get(cat)! }));
    // Also include any unrecognised spelling variants found in the data
    for (const [cat, qty] of beverageByGroup.entries()) {
        if (!beverageArr.find(b => b.group.toLowerCase() === cat.toLowerCase())) {
            beverageArr.push({ group: cat, qty });
        }
    }
    const beverageTotal = beverageArr.reduce((s, b) => s + b.qty, 0);

    // Curry totals — preserve canonical order from CURRY_GROUPS
    const curryArr: { group: string; qty: number }[] = CURRY_GROUPS
        .filter(g => curryByGroup.has(g.label))
        .map(g => ({ group: g.label, qty: curryByGroup.get(g.label)! }));
    const curryTotal = curryArr.reduce((s, c) => s + c.qty, 0);

    uncategorized.sort((a, b) => b.qty - a.qty);

    return NextResponse.json({
        uploadId,
        periodLabel:  upload.periodLabel,
        uploadedAt:   upload.uploadedAt,
        mainProtein: {
            byType:     mainByTypeArr,
            byDish:     [...mainByDish.values()].sort(sortByDish),
            total:      mainTotal,
            groupNames: [...mainGroupNames],
        },
        extraProtein: {
            byType:     extraByTypeArr,
            byDish:     [...extraByDish.values()].sort(sortByDish),
            total:      extraTotal,
            groupNames: [...extraGroupNames],
        },
        desserts: {
            byItem: dessertArr,
            total:  dessertTotal,
        },
        beverages: {
            byGroup: beverageArr,
            total:   beverageTotal,
        },
        curries: {
            byGroup: curryArr,
            total:   curryTotal,
        },
        uncategorized,
        hasProteinData: mainByTypeArr.length > 0 || extraByTypeArr.length > 0,
    });
}
