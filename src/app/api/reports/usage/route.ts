/**
 * GET /api/reports/usage?days=7
 *
 * Last-N-day (default 7) usage from PMIX, per weekday (Mon..Sun), split into
 * four reports: Main Protein, Main Curry, Main Desserts (+ ice-cream flavors),
 * Beverages. Each item resolves to an Ingredient (via Portion Standard itemName
 * or ingredient name) so the UI can apply that ingredient's unit chain, and
 * carries its order→base portion (portionSize/portionUnit) for fallback display.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { matchCurryGroup } from "@/lib/curry-categories";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const dow = (d: Date) => (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6
const zero7 = () => [0, 0, 0, 0, 0, 0, 0];

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const daysParam = Number(new URL(req.url).searchParams.get("days") ?? 7);
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

    const empty = { days, dowCounts, protein: [], curry: [], dessert: [], beverage: [], iceCream: [] };
    if (uploadIds.length === 0) return NextResponse.json(empty);

    const [items, rules, standards, chains] = await Promise.all([
        db.pmixItem.findMany({ where: { uploadId: { in: uploadIds } }, include: { modifiers: true } }),
        db.pmixItemRule.findMany({ where: { isActive: true }, orderBy: [{ priority: "desc" }, { pattern: "asc" }] }),
        db.portionStandard.findMany({
            where: { type: { in: ["modifier", "base"] } },
            include: { ingredient: { select: { id: true, name: true } } },
        }),
        db.reportUnitChain.findMany(),
    ]);

    // Resolve a label → { ingredientId, portionSize, portionUnit } via portion std (itemName or ingredient name)
    type StdVal = { ingredientId: string; portionSize: number; portionUnit: string };
    const stdByName = new Map<string, StdVal>();
    const stdByIng  = new Map<string, StdVal>();
    for (const s of standards) {
        const v: StdVal = { ingredientId: s.ingredientId, portionSize: Number(s.portionSize), portionUnit: s.portionUnit };
        stdByName.set(String(s.itemName).toLowerCase().trim(), v);
        const ik = (s.ingredient?.name ?? "").toLowerCase().trim();
        if (ik && !stdByIng.has(ik)) stdByIng.set(ik, v);
    }
    const lookupStd = (label: string) => { const k = label.toLowerCase().trim(); return stdByName.get(k) ?? stdByIng.get(k); };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainByIng = new Map<string, any>();
    for (const c of chains) chainByIng.set(c.ingredientId, { base: c.base, relations: c.relations });

    const ruleRows = rules as RuleRow[];

    // Accumulators: label → byDow[7]
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

        // Beverages (by POS category)
        if (bevSet.has(category.toLowerCase())) { if (qty > 0) add(beverage, category, d, qty); continue; }

        // Curry (parallel)
        const cg = matchCurryGroup(dishName);
        if (cg && qty > 0) add(curry, cg, d, qty);

        // Ice-cream flavor breakdown (from modifiers of any "ice cream" item)
        if (/ice\s*cream/i.test(dishName)) {
            for (const m of mods) {
                const name = (m.modifier ?? "").trim();
                const mq = Number(m.qtySold ?? 0);
                if (name && mq > 0) add(iceCream, name, d, mq);
            }
        }

        // Protein (modifier choice) vs dish-name classification
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
            else if (res && res.category === "dessert")  add(dessert, res.label, d, qty);
        }
    }

    const build = (m: Map<string, number[]>) => [...m.entries()].map(([label, byDow]) => {
        const std = lookupStd(label);
        return {
            label, byDow, total: byDow.reduce((s, x) => s + x, 0),
            ingredientId: std?.ingredientId ?? null,
            portionSize:  std?.portionSize ?? null,
            portionUnit:  std?.portionUnit ?? null,
            chain:        std?.ingredientId ? (chainByIng.get(std.ingredientId) ?? null) : null,
        };
    }).sort((a, b) => b.total - a.total);

    const buildFlavor = (m: Map<string, number[]>) =>
        [...m.entries()].map(([flavor, byDow]) => ({ flavor, byDow, total: byDow.reduce((s, x) => s + x, 0) }))
            .sort((a, b) => b.total - a.total);

    return NextResponse.json({
        days, dowCounts,
        protein:  build(protein),
        curry:    build(curry),
        dessert:  build(dessert),
        beverage: build(beverage),
        iceCream: buildFlavor(iceCream),
    });
}
