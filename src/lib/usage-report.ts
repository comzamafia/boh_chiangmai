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
    label: string; byDow: number[]; total: number;
    ingredientId: string | null; portionSize: number | null; portionUnit: string | null;
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface UsageReportData {
    days: number; dowCounts: number[];
    protein: UsageReportItem[]; curry: UsageReportItem[]; dessert: UsageReportItem[]; beverage: UsageReportItem[];
    iceCream: { flavor: string; byDow: number[]; total: number }[];
}

export async function buildUsageReport(daysParam: number): Promise<UsageReportData> {
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 60);
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const uploads = await db.pmixUpload.findMany({
        where: { OR: [{ businessDate: { gte: from } }, { businessDate: null, uploadedAt: { gte: from } }] },
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
    if (uploadIds.length === 0) return { days, dowCounts, protein: [], curry: [], dessert: [], beverage: [], iceCream: [] };

    const [items, rules, standards, chains, ingredients] = await Promise.all([
        db.pmixItem.findMany({ where: { uploadId: { in: uploadIds } }, include: { modifiers: true } }),
        db.pmixItemRule.findMany({ where: { isActive: true }, orderBy: [{ priority: "desc" }, { pattern: "asc" }] }),
        db.portionStandard.findMany({
            where: { type: { in: ["modifier", "base"] } },
            include: { ingredient: { select: { id: true, name: true } } },
        }),
        db.reportUnitChain.findMany(),
        db.ingredient.findMany({ select: { id: true, name: true } }),
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainByIng = new Map<string, any>();
    for (const c of chains) chainByIng.set(c.ingredientId, { base: c.base, relations: c.relations });

    const ruleRows = rules as RuleRow[];
    const mk = () => new Map<string, number[]>();
    const add = (m: Map<string, number[]>, label: string, d: number, qty: number) => {
        const a = m.get(label) ?? zero7(); a[d] += qty; m.set(label, a);
    };
    const protein = mk(), curry = mk(), dessert = mk(), beverage = mk(), iceCream = mk();
    const bevSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));

    for (const it of items) {
        const d = uploadDow.get(it.uploadId as string);
        if (d == null) continue;
        const qty = Number(it.qtySold ?? 0);
        const dishName = it.itemName as string;
        const category = (it.category as string) ?? "";
        const mods = it.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        if (bevSet.has(category.toLowerCase())) { if (qty > 0) add(beverage, category, d, qty); continue; }

        const cg = matchCurryGroup(dishName);
        if (cg && qty > 0) add(curry, cg, d, qty);

        if (/ice\s*cream/i.test(dishName)) {
            for (const m of mods) {
                const name = (m.modifier ?? "").trim();
                const mq = Number(m.qtySold ?? 0);
                if (name && mq > 0) add(iceCream, name, d, mq);
            }
        }

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
            else if (res && res.category === "dessert") add(dessert, res.label, d, qty);
        }
    }

    const build = (m: Map<string, number[]>): UsageReportItem[] => [...m.entries()].map(([label, byDow]) => {
        const std = lookupStd(label);
        const ingredientId = std?.ingredientId ?? ingByName.get(label.toLowerCase().trim()) ?? null;
        return {
            label, byDow, total: byDow.reduce((s, x) => s + x, 0),
            ingredientId,
            portionSize: std?.portionSize ?? null,
            portionUnit: std?.portionUnit ?? null,
            chain: ingredientId ? (chainByIng.get(ingredientId) ?? null) : null,
        };
    }).sort((a, b) => b.total - a.total);

    const buildFlavor = (m: Map<string, number[]>) =>
        [...m.entries()].map(([flavor, byDow]) => ({ flavor, byDow, total: byDow.reduce((s, x) => s + x, 0) }))
            .sort((a, b) => b.total - a.total);

    return {
        days, dowCounts,
        protein: build(protein), curry: build(curry), dessert: build(dessert), beverage: build(beverage),
        iceCream: buildFlavor(iceCream),
    };
}
