/**
 * POST /api/usage-settings/import   (admin / manager / chef)
 *
 * Imports a bundle produced by /api/usage-settings/export into THIS branch.
 * Ingredients/composites are matched BY NAME. Rows whose ingredient does not
 * exist on this branch are SKIPPED and reported (we never create ingredients).
 * Existing rows are not duplicated; composites & unit chains are upserted.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const RULE_CATS = new Set(["main_protein", "extra_protein", "dessert", "excluded"]);

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let bundle: Record<string, unknown>;
    try { bundle = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

    // Resolve ingredient names → ids (case-insensitive)
    const ingredients: { id: string; name: string }[] = await db.ingredient.findMany({ select: { id: true, name: true } });
    const ingByName = new Map(ingredients.map(i => [i.name.toLowerCase().trim(), i.id]));
    const missingIngredients = new Set<string>();
    const resolveIng = (name: unknown): string | null => {
        const k = String(name ?? "").toLowerCase().trim();
        const id = ingByName.get(k);
        if (!id) { if (k) missingIngredients.add(String(name)); return null; }
        return id;
    };

    const summary: Record<string, { created: number; skipped: number }> = {
        pmixItemRules: { created: 0, skipped: 0 },
        portionStandards: { created: 0, skipped: 0 },
        unitChains: { created: 0, skipped: 0 },
        composites: { created: 0, skipped: 0 },
        menuCompositeLinks: { created: 0, skipped: 0 },
    };
    const arr = (k: string): Record<string, unknown>[] => Array.isArray(bundle[k]) ? bundle[k] as Record<string, unknown>[] : [];

    // ── PMIX classification rules (dedupe by pattern+matchType+category) ──
    const existRules: { pattern: string; matchType: string; category: string }[] =
        await db.pmixItemRule.findMany({ select: { pattern: true, matchType: true, category: true } });
    const ruleSet = new Set(existRules.map(r => `${r.pattern}||${r.matchType}||${r.category}`));
    for (const r of arr("pmixItemRules")) {
        const pattern = String(r.pattern ?? "").trim();
        const matchType = String(r.matchType ?? "contains").trim();
        const category = String(r.category ?? "").trim();
        if (!pattern || !RULE_CATS.has(category)) { summary.pmixItemRules.skipped++; continue; }
        const key = `${pattern}||${matchType}||${category}`;
        if (ruleSet.has(key)) { summary.pmixItemRules.skipped++; continue; }
        await db.pmixItemRule.create({ data: {
            pattern, matchType, category, label: r.label ? String(r.label).trim() : null,
            priority: Number(r.priority) || 0, isActive: r.isActive !== false, notes: r.notes ? String(r.notes).trim() : null,
        } });
        ruleSet.add(key); summary.pmixItemRules.created++;
    }

    // ── Portion standards (dedupe by itemName+type+ingredientId) ──
    const existPs: { itemName: string; type: string; ingredientId: string }[] =
        await db.portionStandard.findMany({ select: { itemName: true, type: true, ingredientId: true } });
    const psSet = new Set(existPs.map(p => `${p.itemName.toLowerCase()}||${p.type}||${p.ingredientId}`));
    for (const p of arr("portionStandards")) {
        const ingId = resolveIng(p.ingredientName);
        const itemName = String(p.itemName ?? "").trim();
        const type = String(p.type ?? "base").trim();
        const portionSize = Number(p.portionSize);
        const portionUnit = String(p.portionUnit ?? "").trim();
        if (!ingId || !itemName || !(portionSize > 0) || !portionUnit) { summary.portionStandards.skipped++; continue; }
        const key = `${itemName.toLowerCase()}||${type}||${ingId}`;
        if (psSet.has(key)) { summary.portionStandards.skipped++; continue; }
        await db.portionStandard.create({ data: {
            ingredientId: ingId, itemName, type, portionSize, portionUnit, notes: p.notes ? String(p.notes).trim() : null,
        } });
        psSet.add(key); summary.portionStandards.created++;
    }

    // ── Unit chains (upsert by reportKey) ──
    for (const c of arr("unitChains")) {
        const reportKey = String(c.reportKey ?? "").trim();
        const base = String(c.base ?? "").trim();
        const relations = Array.isArray(c.relations) ? c.relations : [];
        if (!reportKey || !base) { summary.unitChains.skipped++; continue; }
        await db.reportUnitChain.upsert({
            where: { reportKey }, update: { base, relations }, create: { reportKey, base, relations },
        });
        summary.unitChains.created++;
    }

    // ── Composites (upsert by name; resolve components, skip missing) ──
    for (const c of arr("composites")) {
        const name = String(c.name ?? "").trim();
        const yieldQty = Number(c.yieldQty);
        const yieldUnit = String(c.yieldUnit ?? "").trim();
        if (!name || !(yieldQty > 0) || !yieldUnit) { summary.composites.skipped++; continue; }
        const comps = (Array.isArray(c.components) ? c.components : [])
            .map((x: Record<string, unknown>) => ({ ingredientId: resolveIng(x.ingredientName), qty: Number(x.qty), unit: String(x.unit ?? "").trim() }))
            .filter((x: { ingredientId: string | null; qty: number; unit: string }) => x.ingredientId && x.qty > 0 && x.unit) as { ingredientId: string; qty: number; unit: string }[];
        const existing = await db.compositeRecipe.findUnique({ where: { name } });
        if (existing) {
            await db.compositeComponent.deleteMany({ where: { compositeId: existing.id } });
            await db.compositeRecipe.update({ where: { id: existing.id }, data: {
                yieldQty, yieldUnit, notes: c.notes ? String(c.notes).trim() : null, components: { create: comps },
            } });
        } else {
            await db.compositeRecipe.create({ data: {
                name, yieldQty, yieldUnit, notes: c.notes ? String(c.notes).trim() : null, components: { create: comps },
            } });
        }
        summary.composites.created++;
    }

    // ── Menu → composite links (dedupe by itemName+compositeId) ──
    const allComposites: { id: string; name: string }[] = await db.compositeRecipe.findMany({ select: { id: true, name: true } });
    const compByName = new Map(allComposites.map(c => [c.name.toLowerCase().trim(), c.id]));
    const existLinks: { itemName: string; compositeId: string }[] =
        await db.menuCompositeLink.findMany({ select: { itemName: true, compositeId: true } });
    const linkSet = new Set(existLinks.map(l => `${l.itemName.toLowerCase()}||${l.compositeId}`));
    const missingComposites = new Set<string>();
    for (const l of arr("menuCompositeLinks")) {
        const itemName = String(l.itemName ?? "").trim();
        const compId = compByName.get(String(l.compositeName ?? "").toLowerCase().trim());
        const qty = Number(l.qty);
        const unit = String(l.unit ?? "").trim();
        if (!compId) { if (l.compositeName) missingComposites.add(String(l.compositeName)); summary.menuCompositeLinks.skipped++; continue; }
        if (!itemName || !(qty > 0) || !unit) { summary.menuCompositeLinks.skipped++; continue; }
        const key = `${itemName.toLowerCase()}||${compId}`;
        if (linkSet.has(key)) { summary.menuCompositeLinks.skipped++; continue; }
        await db.menuCompositeLink.create({ data: { itemName, compositeId: compId, qty, unit, notes: l.notes ? String(l.notes).trim() : null } });
        linkSet.add(key); summary.menuCompositeLinks.created++;
    }

    return NextResponse.json({
        ok: true,
        summary,
        missingIngredients: [...missingIngredients].sort(),
        missingComposites: [...missingComposites].sort(),
    });
}
