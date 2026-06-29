/**
 * Shared Usage Report aggregation — last-N-day PMIX usage split into
 * Main Protein / Curry / Desserts (+ ice-cream flavours) / Beverages, per
 * weekday (Mon..Sun), with each item resolved to an ingredient + unit chain.
 * Used by the in-app route (session auth) and the public API (API key).
 */
import { prisma } from "@/lib/db";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { matchCurryGroup } from "@/lib/curry-categories";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const dow = (d: Date) => (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
const zero7 = () => [0, 0, 0, 0, 0, 0, 0];

export interface UsageReportItem {
    label: string; reportKey: string; byDow: number[]; total: number;
    ingredientId: string | null; portionSize: number | null; portionUnit: string | null;
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface DessertDetailItem {
    itemName: string; byDow: number[]; total: number;
    flavours: { name: string; byDow: number[]; total: number }[];
    reportKey: string;   // "dessert::<category>::<itemName>" — unit-chain key
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface DessertSection {
    category: string;
    items: DessertDetailItem[];
}
export interface UsageReportData {
    days: number; dowCounts: number[];
    protein: UsageReportItem[]; curry: UsageReportItem[]; beverage: UsageReportItem[];
    dessertSections: DessertSection[];
}

const PROTEIN_SORT_ORDER = [
    "chicken", "beef", "shrimp", "lobster", "squid", "soft shell crab",
    "crying tiger steak", "duck", "cm wings", "gai yaang.",
    "kfc ( korean fried cauliflower)", "kfc (korean fried cauliflower)",
    "wagyu khao soi dumplings", "lemongrass chicken dumplings",
    "crispy fish", "salmon crudo", "thai tuna ceviche",
];

export interface DateRangeOpts { from?: string; to?: string }

export async function buildUsageReport(branchId: string, daysParam: number, range?: DateRangeOpts): Promise<UsageReportData> {
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
    if (uploadIds.length === 0) return { days, dowCounts, protein: [], curry: [], beverage: [], dessertSections: [] };

    const [items, rules, standards, chains, ingredients] = await Promise.all([
        db.pmixItem.findMany({ where: { uploadId: { in: uploadIds }, branchId }, include: { modifiers: true } }),
        db.pmixItemRule.findMany({ where: { isActive: true, branchId }, orderBy: [{ priority: "desc" }, { pattern: "asc" }] }),
        db.portionStandard.findMany({
            where: { type: { in: ["modifier", "base"] }, branchId },
            include: { ingredient: { select: { id: true, name: true } } },
        }),
        db.reportUnitChain.findMany({ where: { branchId } }),
        db.ingredient.findMany({ where: { branchId }, select: { id: true, name: true } }),
    ]);

    type StdVal = { ingredientId: string; portionSize: number; portionUnit: string };
    const stdByName = new Map<string, StdVal>();
    const stdByIng = new Map<string, StdVal>();
    for (const s of standards) {
        const v: StdVal = { ingredientId: s.ingredientId, portionSize: Number(s.portionSize), portionUnit: s.portionUnit };
        stdByName.set(String(s.itemName).toLowerCase().trim(), v);
        const ik = (s.ingredient?.name ?? "").toLowerCase().trim();
        if (ik && !stdByIng.has(ik)) stdByIng.set(ik, v);
    }
    const lookupStd = (label: string) => { const k = label.toLowerCase().trim(); return stdByName.get(k) ?? stdByIng.get(k); };
    const ingByName = new Map<string, string>();
    for (const ig of ingredients) ingByName.set(ig.name.toLowerCase().trim(), ig.id);
    // Unit chains are now keyed per report item ("<category>::<label>"), so each
    // row (e.g. Panang Curry vs Chicken) has its own independent chain.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainByKey = new Map<string, any>();
    for (const c of chains) if (c.reportKey) chainByKey.set(c.reportKey, { base: c.base, relations: c.relations });

    const ruleRows = rules as RuleRow[];
    const mk = () => new Map<string, number[]>();
    const add = (m: Map<string, number[]>, label: string, d: number, qty: number) => {
        const a = m.get(label) ?? zero7(); a[d] += qty; m.set(label, a);
    };
    const protein = mk(), curry = mk(), beverage = mk();
    const bevSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));

    // ── Dessert detail tracking (per item, with modifier flavours) ──
    type DessertRaw = { byDow: number[]; flavours: Map<string, number[]> };
    const dessertItems = new Map<string, DessertRaw>();
    const kidsMealItems = new Map<string, DessertRaw>();
    const addDessert = (map: Map<string, DessertRaw>, name: string, d: number, qty: number) => {
        let entry = map.get(name);
        if (!entry) { entry = { byDow: zero7(), flavours: new Map() }; map.set(name, entry); }
        entry.byDow[d] += qty;
    };
    const addFlavour = (map: Map<string, DessertRaw>, itemName: string, flavour: string, d: number, qty: number) => {
        const entry = map.get(itemName);
        if (!entry) return;
        const a = entry.flavours.get(flavour) ?? zero7(); a[d] += qty; entry.flavours.set(flavour, a);
    };

    // Track which items have already been claimed by dessert/kids-meal categories
    // so they don't also get classified as proteins
    const dessertClaimed = new Set<string>();

    for (const it of items) {
        const d = uploadDow.get(it.uploadId as string);
        if (d == null) continue;
        const qty = Number(it.qtySold ?? 0);
        const dishName = it.itemName as string;
        const category = (it.category as string) ?? "";
        const catLower = category.toLowerCase();
        const mods = it.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        if (bevSet.has(catLower)) { if (qty > 0) add(beverage, category, d, qty); continue; }

        // ── Dessert category (POS "Desserts" / "Dessert") ──
        if (/dessert/i.test(catLower)) {
            if (qty > 0) {
                addDessert(dessertItems, dishName, d, qty);
                dessertClaimed.add(it.id as string);
                // Ice Cream / Ube Tiramisu → capture modifier flavours
                if (/ice\s*cream|ube\s*tiramisu/i.test(dishName)) {
                    for (const m of mods) {
                        const name = (m.modifier ?? "").trim();
                        const mq = Number(m.qtySold ?? 0);
                        if (name && mq > 0) addFlavour(dessertItems, dishName, name, d, mq);
                    }
                }
            }
            continue;
        }

        // ── Kids Meal category ──
        if (/kids?\s*meal/i.test(catLower)) {
            if (qty > 0) {
                addDessert(kidsMealItems, dishName, d, qty);
                dessertClaimed.add(it.id as string);
                // Capture "Choice of Dessert" modifiers
                for (const m of mods) {
                    const grp = (m.modifierGroup ?? "").toLowerCase();
                    const name = (m.modifier ?? "").trim();
                    const mq = Number(m.qtySold ?? 0);
                    if (grp.includes("dessert") && name && mq > 0) {
                        addFlavour(kidsMealItems, dishName, name, d, mq);
                    }
                }
            }
            continue;
        }

        // ── Curry ──
        const cg = matchCurryGroup(dishName);
        if (cg && qty > 0) add(curry, cg, d, qty);

        // ── Protein (from ALL categories: main dishes + appetizers + starters) ──
        if (hasMainProteinModifier(mods)) {
            for (const m of mods) {
                const grp = (m.modifierGroup ?? "").toLowerCase();
                const name = (m.modifier ?? "").trim();
                const mq = Number(m.qtySold ?? 0);
                const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
                if (grp.includes("protein") && !isExtra && name && mq > 0) {
                    const cls = classifyItem(name, ruleRows);
                    if (cls?.category !== "excluded") add(protein, name, d, mq);
                }
            }
        } else if (qty > 0) {
            const res = classifyItem(dishName, ruleRows);
            if (res && res.category === "main_protein") add(protein, res.label, d, qty);
            // Fallback: items classified as dessert by rules (not already in a dessert POS category)
            else if (res && res.category === "dessert" && !dessertClaimed.has(it.id as string)) {
                addDessert(dessertItems, res.label, d, qty);
            }
        }
    }

    // ── Build protein with custom sort order ──
    const build = (m: Map<string, number[]>, category: string): UsageReportItem[] => [...m.entries()].map(([label, byDow]) => {
        const std = lookupStd(label);
        const ingredientId = std?.ingredientId ?? ingByName.get(label.toLowerCase().trim()) ?? null;
        const reportKey = `${category}::${label}`;
        return {
            label, reportKey, byDow, total: byDow.reduce((s, x) => s + x, 0),
            ingredientId,
            portionSize: std?.portionSize ?? null,
            portionUnit: std?.portionUnit ?? null,
            chain: chainByKey.get(reportKey) ?? null,
        };
    }).sort((a, b) => b.total - a.total);

    const proteinRows = build(protein, "protein");
    // Custom sort: follow PROTEIN_SORT_ORDER, then remaining items by total desc
    const sortedProtein = proteinRows.sort((a, b) => {
        const ai = PROTEIN_SORT_ORDER.indexOf(a.label.toLowerCase().trim());
        const bi = PROTEIN_SORT_ORDER.indexOf(b.label.toLowerCase().trim());
        if (ai >= 0 && bi >= 0) return ai - bi;
        if (ai >= 0) return -1;
        if (bi >= 0) return 1;
        return b.total - a.total;
    });

    // ── Build dessert sections ──
    const buildDessertSection = (map: Map<string, DessertRaw>, catName: string): DessertSection => {
        const sectionItems: DessertDetailItem[] = [...map.entries()]
            .map(([itemName, raw]) => {
                const reportKey = `dessert::${catName}::${itemName}`;
                return {
                    itemName,
                    byDow: raw.byDow,
                    total: raw.byDow.reduce((s, x) => s + x, 0),
                    flavours: [...raw.flavours.entries()]
                        .map(([name, byDow]) => ({ name, byDow, total: byDow.reduce((s, x) => s + x, 0) }))
                        .sort((a, b) => b.total - a.total),
                    reportKey,
                    chain: chainByKey.get(reportKey) ?? null,
                };
            })
            .sort((a, b) => b.total - a.total);
        return { category: catName, items: sectionItems };
    };

    const dessertSections: DessertSection[] = [];
    if (dessertItems.size > 0) dessertSections.push(buildDessertSection(dessertItems, "Desserts"));
    if (kidsMealItems.size > 0) dessertSections.push(buildDessertSection(kidsMealItems, "Kids Meal"));

    return {
        days, dowCounts,
        protein: sortedProtein,
        curry: build(curry, "curry"),
        beverage: build(beverage, "beverage"),
        dessertSections,
    };
}
