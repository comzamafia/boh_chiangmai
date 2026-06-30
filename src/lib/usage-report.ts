/**
 * Shared Usage Report aggregation — last-N-day PMIX usage split into
 * Main Protein / Curry / Desserts (+ ice-cream flavours) / Beverages, per
 * weekday (Mon..Sun), with each item resolved to an ingredient + unit chain.
 * Used by the in-app route (session auth) and the public API (API key).
 */
import { prisma } from "@/lib/db";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { matchCurryGroup } from "@/lib/curry-categories";
import { classifyPosCategory } from "@/lib/beverage-categories";

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

    // ── Dessert detail tracking (per item, with modifier flavours) ──
    type DessertRaw = { byDow: number[]; flavours: Map<string, number[]> };
    const dessertItems = new Map<string, DessertRaw>();
    const kidsMealItems = new Map<string, DessertRaw>();
    // Key used for the synthetic "combined ice cream flavors" row in Kids Meal section
    const KIDS_ICE_CREAM_KEY = "Ice Cream Flavors";
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
    // Strip trailing " -" or "-" from POS names (deduplicates POS variants like "Cheesecake-")
    const normDessert = (name: string) => name.replace(/\s*-+\s*$/, "").trim();
    // Build canonical Ice Cream flavor item name
    const iceCreamFlavourItem = (flavour: string) =>
        /ice\s*cream/i.test(flavour) ? flavour : `${flavour} Ice Cream`;

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

        if (classifyPosCategory(catLower) !== null) { if (qty > 0) add(beverage, category, d, qty); continue; }

        // ── Dessert category (POS "Desserts" / "Dessert") ──
        if (/dessert/i.test(catLower)) {
            if (qty > 0) {
                const normalized = normDessert(dishName);
                dessertClaimed.add(it.id as string);
                if (/^ice\s*cream$/i.test(normalized)) {
                    // Ice Cream: each flavour becomes a top-level item (not a sub-item under "Ice Cream")
                    let hasFlavours = false;
                    for (const m of mods) {
                        const flavour = (m.modifier ?? "").trim();
                        const mq = Number(m.qtySold ?? 0);
                        if (flavour && mq > 0) {
                            addDessert(dessertItems, iceCreamFlavourItem(flavour), d, mq);
                            hasFlavours = true;
                        }
                    }
                    // Fallback: no modifiers — keep as generic "Ice Cream"
                    if (!hasFlavours) addDessert(dessertItems, "Ice Cream", d, qty);
                } else if (/ube\s*tiramisu/i.test(normalized)) {
                    // Ube Tiramisu: keep sub-flavour structure
                    addDessert(dessertItems, normalized, d, qty);
                    for (const m of mods) {
                        const name = (m.modifier ?? "").trim();
                        const mq = Number(m.qtySold ?? 0);
                        if (name && mq > 0) addFlavour(dessertItems, normalized, name, d, mq);
                    }
                } else {
                    addDessert(dessertItems, normalized, d, qty);
                }
            }
            continue;
        }

        // ── Kids Meal category ──
        if (/kids?\s*meal/i.test(catLower)) {
            if (qty > 0) {
                addDessert(kidsMealItems, dishName, d, qty);
                dessertClaimed.add(it.id as string);
                // Capture ice cream / dessert choice modifiers (aggregated later into one combined row)
                for (const m of mods) {
                    const grp = (m.modifierGroup ?? "").toLowerCase();
                    const name = (m.modifier ?? "").trim();
                    const mq = Number(m.qtySold ?? 0);
                    if ((grp.includes("dessert") || grp.includes("ice cream") || grp.includes("flavour") || grp.includes("flavor")) && name && mq > 0) {
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

    // ── Post-process desserts ──

    // Molten Lava Cake is served with 1 scoop Vanilla Ice Cream → add to Vanilla Ice Cream count
    for (const [name, raw] of dessertItems.entries()) {
        if (/molten.*lava|lava.*cake/i.test(name)) {
            const vanillaKey = "Vanilla Ice Cream";
            let v = dessertItems.get(vanillaKey);
            if (!v) { v = { byDow: zero7(), flavours: new Map() }; dessertItems.set(vanillaKey, v); }
            for (let i = 0; i < 7; i++) v.byDow[i] += raw.byDow[i];
        }
    }

    // Kids Meal: aggregate all ice cream / dessert flavour choices across every dish into one row
    // (excluding "None" or blank) and clear individual item flavour breakdowns
    const kidsCombined = new Map<string, number[]>();
    for (const raw of kidsMealItems.values()) {
        for (const [flavour, byDow] of raw.flavours.entries()) {
            if (!flavour.trim() || flavour.toLowerCase().trim() === "none") continue;
            const agg = kidsCombined.get(flavour) ?? zero7();
            for (let i = 0; i < 7; i++) agg[i] += byDow[i];
            kidsCombined.set(flavour, agg);
        }
        raw.flavours.clear();  // remove per-dish breakdown — shown combined instead
    }
    if (kidsCombined.size > 0) {
        const combinedByDow = zero7();
        for (const byDow of kidsCombined.values()) for (let i = 0; i < 7; i++) combinedByDow[i] += byDow[i];
        kidsMealItems.set(KIDS_ICE_CREAM_KEY, { byDow: combinedByDow, flavours: kidsCombined });
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
            .sort((a, b) => {
                // Synthetic "Ice Cream Flavors" combined row always appears last
                if (a.itemName === KIDS_ICE_CREAM_KEY) return 1;
                if (b.itemName === KIDS_ICE_CREAM_KEY) return -1;
                return b.total - a.total;
            });
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
