/**
 * ingredient-usage.ts
 *
 * Rolls last-N-day PMIX sales up to the INGREDIENT level, so the same
 * ingredient is summed across every dish/category it appears in (e.g. Shrimp
 * used in a main dish AND in "Thai Shrimp Rolls" lands in one Shrimp total).
 *
 * A sold menu item is decomposed via:
 *   1. portion_standards rows matching the dish (or a modifier) name
 *      → { ingredient, portionSize, portionUnit } per order/modifier.
 *   2. menu_composite_links matching the dish (or modifier) name
 *      → a composite that EXPANDS into its real ingredients, scaled by
 *        batches = (orders × usedQty) / composite.yieldQty.
 *        e.g. Islamic Noodles → Curry Sauce 14 oz, yield 14 oz =
 *             Panang 7 oz + Massaman 7 oz  → 1 batch → 7 + 7.
 *
 * Totals are tracked per (ingredient, unit) — most ingredients use one unit so
 * this stays clean, and we avoid fragile cross-unit conversions. Each ingredient
 * keeps a provenance list (which dish/modifier contributed, and via which
 * composite) for the drill-down.
 */
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const dow = (d: Date) => (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
const zero7 = () => [0, 0, 0, 0, 0, 0, 0];
const num = (x: unknown) => Number(x);

export interface IngredientUsageUnit { unit: string; byDow: number[]; total: number }
export interface IngredientUsageSource { label: string; via: string | null; unit: string; total: number }
export interface IngredientUsageRow {
    ingredientId: string;
    name: string;
    categoryName: string | null;
    isProtein: boolean;
    units: IngredientUsageUnit[];
    sources: IngredientUsageSource[];
    reportKey: string;   // "ingredient::<id>" — key for its unit-conversion chain
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface IngredientUsageData {
    days: number;
    dowCounts: number[];
    ingredients: IngredientUsageRow[];
}

interface Acc {
    name: string;
    units: Map<string, number[]>;                 // unit → byDow[7]
    sources: Map<string, IngredientUsageSource>;   // "label|||via|||unit" → source
}

// Explicit protein display order for the Main Protein tab (lowercase, trimmed).
// Ingredients in the "Proteins" category that aren't listed here still count as
// proteins — they just sort after these, by total.
export const PROTEIN_DISPLAY_ORDER = [
    "chicken", "beef", "shrimp", "lobster", "squid", "soft shell crab",
    "crying tiger steak", "duck", "cm wings", "gai yaang.",
    "kfc ( korean fried cauliflower)", "kfc (korean fried cauliflower)",
    "wagyu khao soi dumplings", "lemongrass chicken dumplings",
    "crispy fish", "salmon crudo", "thai tuna ceviche",
];
const proteinRank = (name: string) => {
    const i = PROTEIN_DISPLAY_ORDER.indexOf(name.toLowerCase().trim());
    return i < 0 ? Number.MAX_SAFE_INTEGER : i;
};

export interface DateRangeOpts { from?: string; to?: string }

export async function buildIngredientUsage(branchId: string, daysParam: number, range?: DateRangeOpts): Promise<IngredientUsageData> {
    const from = range?.from ? new Date(range.from + "T00:00:00Z") : new Date(Date.now() - Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 60) * 24 * 60 * 60 * 1000);
    const to = range?.to ? new Date(range.to + "T23:59:59.999Z") : undefined;
    const days = to ? Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000)) : Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 60);

    const dateFilter = to
        ? { OR: [{ businessDate: { gte: from, lte: to } }, { businessDate: null, uploadedAt: { gte: from, lte: to } }] }
        : { OR: [{ businessDate: { gte: from } }, { businessDate: null, uploadedAt: { gte: from } }] };

    const uploads = await db.pmixUpload.findMany({
        where: { branchId, ...dateFilter },
        select: { id: true, businessDate: true, uploadedAt: true },
    });
    const uploadDow = new Map<string, number>();
    const dowCounts = zero7();
    const seenDates = new Set<string>();
    for (const u of uploads) {
        const d = (u.businessDate ?? u.uploadedAt) as Date;
        uploadDow.set(u.id as string, dow(d));
        const key = d.toISOString().slice(0, 10);
        if (!seenDates.has(key)) { seenDates.add(key); dowCounts[dow(d)] += 1; }
    }
    const uploadIds = uploads.map((u: { id: string }) => u.id);
    if (uploadIds.length === 0) return { days, dowCounts, ingredients: [] };

    const [items, standards, links, allIngredients, chains] = await Promise.all([
        db.pmixItem.findMany({ where: { uploadId: { in: uploadIds }, branchId }, include: { modifiers: true } }),
        db.portionStandard.findMany({ where: { branchId }, include: { ingredient: { select: { id: true, name: true } } } }),
        db.menuCompositeLink.findMany({
            where: { branchId },
            include: { composite: { include: { components: { include: { ingredient: { select: { id: true, name: true } } } } } } },
        }),
        db.ingredient.findMany({ where: { branchId }, select: { id: true, category: { select: { name: true } } } }),
        db.reportUnitChain.findMany({ where: { branchId } }),
    ]);

    // Per-ingredient unit-conversion chains, keyed "ingredient::<id>".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainByKey = new Map<string, any>();
    for (const c of chains) if (c.reportKey) chainByKey.set(c.reportKey, { base: c.base, relations: c.relations });

    // ingredientId → category name (for the protein filter on the Main Protein tab)
    const catByIng = new Map<string, string | null>();
    for (const ig of allIngredients as { id: string; category: { name: string } | null }[]) {
        catByIng.set(ig.id, ig.category?.name ?? null);
    }
    const isProteinIng = (ingredientId: string, name: string) => {
        const cat = (catByIng.get(ingredientId) ?? "").toLowerCase();
        return /protein/.test(cat) || proteinRank(name) !== Number.MAX_SAFE_INTEGER;
    };

    // ── Name → recipe lookups (case-insensitive), SPLIT BY TYPE ───────────────
    // type="base"     rows describe a DISH    → matched against the sold item name.
    // type="modifier" rows describe a MODIFIER → matched against modifier names.
    // Keeping them separate is what stops e.g. a "Duck Panang" modifier row (Extra
    // Chicken) from being added to every Duck Panang dish sold.
    interface RawComp { ingredientId: string; name: string; portionSize: number; portionUnit: string }
    const psBaseByName = new Map<string, RawComp[]>();
    const psModByName  = new Map<string, RawComp[]>();
    for (const s of standards) {
        if (!s.ingredient) continue;
        const k = String(s.itemName).toLowerCase().trim();
        const target = String(s.type) === "modifier" ? psModByName : psBaseByName;
        (target.get(k) ?? target.set(k, []).get(k)!).push({
            ingredientId: s.ingredient.id, name: s.ingredient.name,
            portionSize: num(s.portionSize), portionUnit: s.portionUnit,
        });
    }

    interface LinkRow {
        compositeName: string; yieldQty: number; usedQty: number;
        components: { ingredientId: string; name: string; qty: number; unit: string }[];
    }
    const linkByName = new Map<string, LinkRow[]>();
    for (const l of links) {
        if (!l.composite) continue;
        const k = String(l.itemName).toLowerCase().trim();
        (linkByName.get(k) ?? linkByName.set(k, []).get(k)!).push({
            compositeName: l.composite.name,
            yieldQty: num(l.composite.yieldQty) || 1,
            usedQty: num(l.qty),
            components: (l.composite.components ?? [])
                .filter((c: { ingredient?: unknown }) => c.ingredient)
                .map((c: { ingredient: { id: string; name: string }; qty: unknown; unit: string }) => ({
                    ingredientId: c.ingredient.id, name: c.ingredient.name, qty: num(c.qty), unit: c.unit,
                })),
        });
    }

    // ── Accumulate ────────────────────────────────────────────────────────────
    const byIng = new Map<string, Acc>();
    const add = (ingredientId: string, name: string, unit: string, d: number, amount: number, label: string, via: string | null) => {
        if (!(amount > 0)) return;
        const acc = byIng.get(ingredientId) ?? { name, units: new Map(), sources: new Map() };
        const arr = acc.units.get(unit) ?? zero7();
        arr[d] += amount; acc.units.set(unit, arr);
        const sk = `${label}|||${via ?? ""}|||${unit}`;
        const src = acc.sources.get(sk) ?? { label, via, unit, total: 0 };
        src.total += amount; acc.sources.set(sk, src);
        byIng.set(ingredientId, acc);
    };

    const applyStds = (map: Map<string, RawComp[]>, rawName: string, count: number, d: number) => {
        for (const c of map.get(rawName.toLowerCase().trim()) ?? []) {
            add(c.ingredientId, c.name, c.portionUnit, d, count * c.portionSize, rawName, null);
        }
    };

    // DISH context: base portion standards + composite links (links are dish-level).
    const applyDish = (rawName: string, count: number, d: number) => {
        if (!(count > 0)) return;
        applyStds(psBaseByName, rawName, count, d);
        for (const l of linkByName.get(rawName.toLowerCase().trim()) ?? []) {
            const batches = l.yieldQty > 0 ? (count * l.usedQty) / l.yieldQty : 0;
            for (const comp of l.components) {
                add(comp.ingredientId, comp.name, comp.unit, d, batches * comp.qty, rawName, l.compositeName);
            }
        }
    };

    for (const it of items) {
        const d = uploadDow.get(it.uploadId as string);
        if (d == null) continue;
        applyDish(it.itemName as string, num(it.qtySold), d);
        // MODIFIER context: only modifier-type standards, scaled by the modifier's own qty.
        for (const m of (it.modifiers ?? []) as { modifier: string; qtySold: number }[]) {
            if (num(m.qtySold) > 0) applyStds(psModByName, m.modifier, num(m.qtySold), d);
        }
    }

    // ── Shape output ──────────────────────────────────────────────────────────
    const ingredients: IngredientUsageRow[] = [...byIng.entries()].map(([ingredientId, acc]) => {
        const reportKey = `ingredient::${ingredientId}`;
        return {
            ingredientId,
            name: acc.name,
            categoryName: catByIng.get(ingredientId) ?? null,
            isProtein: isProteinIng(ingredientId, acc.name),
            units: [...acc.units.entries()]
                .map(([unit, byDow]) => ({ unit, byDow, total: byDow.reduce((s, x) => s + x, 0) }))
                .sort((a, b) => b.total - a.total),
            sources: [...acc.sources.values()].sort((a, b) => b.total - a.total),
            reportKey,
            chain: chainByKey.get(reportKey) ?? null,
        };
    }).sort((a, b) => a.name.localeCompare(b.name));

    return { days, dowCounts, ingredients };
}
