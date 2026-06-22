/**
 * protein-report.ts
 *
 * Builds the Usage Report's Main Protein tab by folding the ingredient-level
 * roll-up (buildIngredientUsage) into configured PROTEIN GROUPS.
 *
 * A protein group (e.g. "Chicken") is a display name + sort order that maps to
 * one or more real ingredients (CHICKEN - Breast, Chicken - Wings, GROUND
 * CHICKEN, …). Its usage = the sum of its member ingredients across every dish,
 * modifier, add-on, and composite — i.e. exactly the figures the Ingredients tab
 * shows, just consolidated under one row and ordered the way the kitchen tracks
 * protein.
 *
 * Proteins (ingredients tagged "Proteins" / matching the protein name list) that
 * aren't assigned to any group are returned individually as ungrouped rows, so
 * nothing protein-related ever silently drops out ("Protein อื่นๆ").
 */
import { buildIngredientUsage, type IngredientUsageRow } from "@/lib/ingredient-usage";
import { prisma } from "@/lib/db";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const zero7 = () => [0, 0, 0, 0, 0, 0, 0];

export interface ProteinUnit { unit: string; byDow: number[]; total: number }
export interface ProteinMember {
    ingredientId: string;
    name: string;
    units: ProteinUnit[];
    sources: { label: string; via: string | null; unit: string; total: number }[];
}
export interface ProteinGroupRow {
    /** Group id, or "ungrouped:<ingredientId>" for a lone protein not in any group. */
    id: string;
    name: string;
    grouped: boolean;          // false = an ungrouped protein shown on its own
    sortOrder: number;
    units: ProteinUnit[];      // summed across members
    members: ProteinMember[];  // drill-down
    reportKey: string;         // unit-chain key ("protein::<groupId>" or "ingredient::<id>")
    chain: { base: string; relations: { from: string; qty: number; to: string }[] } | null;
}
export interface ProteinReportData {
    days: number;
    dowCounts: number[];
    groups: ProteinGroupRow[];
}

function sumUnits(rows: IngredientUsageRow[]): ProteinUnit[] {
    const byUnit = new Map<string, number[]>();
    for (const r of rows) {
        for (const u of r.units) {
            const arr = byUnit.get(u.unit) ?? zero7();
            for (let i = 0; i < 7; i++) arr[i] += u.byDow[i] ?? 0;
            byUnit.set(u.unit, arr);
        }
    }
    return [...byUnit.entries()]
        .map(([unit, byDow]) => ({ unit, byDow, total: byDow.reduce((s, x) => s + x, 0) }))
        .sort((a, b) => b.total - a.total);
}

const toMember = (r: IngredientUsageRow): ProteinMember => ({
    ingredientId: r.ingredientId,
    name: r.name,
    units: r.units,
    sources: r.sources,
});

export async function buildProteinReport(daysParam: number): Promise<ProteinReportData> {
    const [usage, groups, chains] = await Promise.all([
        buildIngredientUsage(daysParam),
        db.proteinGroup.findMany({
            orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
            include: { members: { select: { ingredientId: true } } },
        }),
        db.reportUnitChain.findMany(),
    ]);

    // Group-level unit chains, keyed "protein::<groupId>".
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const chainByKey = new Map<string, any>();
    for (const c of chains) if (c.reportKey) chainByKey.set(c.reportKey, { base: c.base, relations: c.relations });

    const byIngId = new Map<string, IngredientUsageRow>();
    for (const r of usage.ingredients) byIngId.set(r.ingredientId, r);

    const claimed = new Set<string>();
    const rows: ProteinGroupRow[] = [];

    // 1. Configured groups (in sort order) — sum their member ingredients.
    for (const g of groups as { id: string; name: string; sortOrder: number; members: { ingredientId: string }[] }[]) {
        const memberRows: IngredientUsageRow[] = [];
        for (const m of g.members) {
            const row = byIngId.get(m.ingredientId);
            claimed.add(m.ingredientId);     // claimed even with zero usage this window
            if (row) memberRows.push(row);
        }
        const reportKey = `protein::${g.id}`;
        rows.push({
            id: g.id,
            name: g.name,
            grouped: true,
            sortOrder: g.sortOrder,
            units: sumUnits(memberRows),
            members: memberRows.map(toMember).sort((a, b) =>
                (b.units[0]?.total ?? 0) - (a.units[0]?.total ?? 0)),
            reportKey,
            chain: chainByKey.get(reportKey) ?? null,
        });
    }

    // 2. Ungrouped proteins → one row each, after the groups, by total desc.
    //    These reuse the ingredient's own chain (shared with the Ingredients tab).
    const ungrouped = usage.ingredients
        .filter(r => r.isProtein && !claimed.has(r.ingredientId))
        .sort((a, b) => (b.units[0]?.total ?? 0) - (a.units[0]?.total ?? 0));
    const baseOrder = (groups.length ? Math.max(...groups.map((g: { sortOrder: number }) => g.sortOrder)) : 0) + 1000;
    for (const r of ungrouped) {
        rows.push({
            id: `ungrouped:${r.ingredientId}`,
            name: r.name,
            grouped: false,
            sortOrder: baseOrder,
            units: r.units,
            members: [toMember(r)],
            reportKey: r.reportKey,
            chain: r.chain,
        });
    }

    return { days: usage.days, dowCounts: usage.dowCounts, groups: rows };
}
