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
import { getSession } from "@/lib/auth";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";
import { CURRY_GROUPS, matchCurryGroup } from "@/lib/curry-categories";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Upload header
    const upload = await db.pmixUpload.findUnique({
        where:  { id: uploadId },
        select: { id: true, periodLabel: true, uploadedAt: true },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 2. All items + modifiers
    const pmixItems = await db.pmixItem.findMany({
        where:   { uploadId },
        include: { modifiers: true },
    });

    // 3. Portion standards
    const standards = await db.portionStandard.findMany({
        include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } },
    });
    const stdByName = new Map<string, {
        ingredientName: string; portionSize: number; portionUnit: string; ingredientId: string;
    }>();
    for (const s of standards) {
        if (s.type === "modifier" || s.type === "base") {
            stdByName.set(String(s.itemName).toLowerCase().trim(), {
                ingredientName: s.ingredient?.name ?? s.itemName,
                portionSize:    Number(s.portionSize),
                portionUnit:    s.portionUnit,
                ingredientId:   s.ingredientId,
            });
        }
    }

    // 4. Item rules (sorted priority desc)
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // ─── Accumulators ─────────────────────────────────────────────────────────
    interface ByType { proteinType: string; qty: number; totalUsed: number | null; portionSize: number | null; portionUnit: string | null; ingredientName: string | null }
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

    // Beverage category lookup (lowercase for fast matching)
    const beverageCatSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));

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

        if (hasProteinModifier(mods)) {
            // ── Modifier-based path (existing logic) ──────────────────────────
            for (const mod of mods) {
                const grp    = (mod.modifierGroup ?? "").toLowerCase();
                const name   = mod.modifier ?? "";
                const modQty = Number(mod.qtySold ?? 0);
                const isExtra   = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
                const isMainPro = grp.includes("protein") && !isExtra;

                // Apply exclusion rules to modifier names too (e.g. "Veg & Tofu" → excluded)
                if (isMainPro || isExtra) {
                    const modClass = classifyItem(name, rules);
                    if (modClass?.category === "excluded") continue;
                }

                if (isMainPro) {
                    mainGroupNames.add(mod.modifierGroup);
                    mainByType.set(name, (mainByType.get(name) ?? 0) + modQty);
                    const k = `${dishName}|||${name}`;
                    const ex = mainByDish.get(k);
                    if (ex) ex.qty += modQty;
                    else    mainByDish.set(k, { category, dish: dishName, proteinType: name, qty: modQty });
                } else if (isExtra) {
                    extraGroupNames.add(mod.modifierGroup);
                    extraByType.set(name, (extraByType.get(name) ?? 0) + modQty);
                    const k = `${dishName}|||${name}`;
                    const ex = extraByDish.get(k);
                    if (ex) ex.qty += modQty;
                    else    extraByDish.set(k, { category, dish: dishName, proteinType: name, qty: modQty });
                }
            }
        } else {
            // ── Item-rule path (new) ──────────────────────────────────────────
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
        const std = stdByName.get(proteinType.toLowerCase().trim());
        if (!std) return { proteinType, qty, totalUsed: null, portionSize: null, portionUnit: null, ingredientName: null };
        return {
            proteinType,
            qty,
            totalUsed:      qty * std.portionSize,
            portionSize:    std.portionSize,
            portionUnit:    std.portionUnit,
            ingredientName: std.ingredientName,
        };
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
