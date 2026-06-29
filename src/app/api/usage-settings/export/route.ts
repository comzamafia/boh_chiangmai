/**
 * GET /api/usage-settings/export   (admin / manager / chef)
 *
 * Exports ALL Usage-Report calculation settings as one JSON bundle so it can be
 * imported into another branch. Ingredients/composites are referenced BY NAME
 * (not internal IDs) so the file is portable across branch databases.
 *   - PMIX classification rules
 *   - Portion standards (menu/modifier → ingredient amounts)
 *   - Unit chains (per report item)
 *   - Composite sub-recipes (+ components)
 *   - Menu → composite links
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { branchIdentity } from "@/lib/public-api";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId, branchSlug, branchName } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const [rules, standards, chains, composites, links] = await Promise.all([
        db.pmixItemRule.findMany({ where: { branchId } }),
        db.portionStandard.findMany({ where: { branchId }, include: { ingredient: { select: { name: true } } } }),
        db.reportUnitChain.findMany({ where: { branchId, reportKey: { not: null } } }),
        db.compositeRecipe.findMany({ where: { branchId }, include: { components: { include: { ingredient: { select: { name: true } } } } } }),
        db.menuCompositeLink.findMany({ where: { branchId }, include: { composite: { select: { name: true } } } }),
    ]);

    const bundle = {
        version: 1,
        exportedAt: new Date().toISOString(),
        branch: branchIdentity({ slug: branchSlug, name: branchName }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        pmixItemRules: rules.map((r: any) => ({
            pattern: r.pattern, matchType: r.matchType, category: r.category,
            label: r.label, priority: r.priority, isActive: r.isActive, notes: r.notes,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        portionStandards: standards.filter((s: any) => s.ingredient).map((s: any) => ({
            itemName: s.itemName, type: s.type, ingredientName: s.ingredient.name,
            portionSize: Number(s.portionSize), portionUnit: s.portionUnit, notes: s.notes,
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        unitChains: chains.map((c: any) => ({ reportKey: c.reportKey, base: c.base, relations: c.relations })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        composites: composites.map((c: any) => ({
            name: c.name, yieldQty: Number(c.yieldQty), yieldUnit: c.yieldUnit, notes: c.notes,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            components: (c.components ?? []).filter((x: any) => x.ingredient).map((x: any) => ({
                ingredientName: x.ingredient.name, qty: Number(x.qty), unit: x.unit,
            })),
        })),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        menuCompositeLinks: links.filter((l: any) => l.composite).map((l: any) => ({
            itemName: l.itemName, compositeName: l.composite.name, qty: Number(l.qty), unit: l.unit, notes: l.notes,
        })),
    };

    return new NextResponse(JSON.stringify(bundle, null, 2), {
        headers: {
            "Content-Type": "application/json",
            "Content-Disposition": `attachment; filename="usage-settings-${new Date().toISOString().slice(0, 10)}.json"`,
        },
    });
}
