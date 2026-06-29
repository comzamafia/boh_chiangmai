/**
 * GET /api/inventory/area-breakdown
 *
 * Returns, per ingredient, how its physical stock is distributed across
 * storage areas (from StorageAreaCount). Lets the Inventory page show
 * "Wagyu = 50 Freezer 1 + 30 Freezer 2 = 80" for items stored in many areas.
 *
 *   { byIngredient: { [ingredientId]: {
 *       total: number,
 *       areas: [{ areaId, areaName, recipeQty, countedAt }]   // sorted desc by qty
 *   } } }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export const dynamic = "force-dynamic";

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const [rows, areas] = await Promise.all([
        db.storageAreaCount.findMany({
            where: { branchId },
            select: { ingredientId: true, storageAreaId: true, recipeQty: true, countedAt: true },
        }),
        db.storageArea.findMany({ where: { branchId }, select: { id: true, name: true } }),
    ]);

    const areaName = new Map<string, string>();
    for (const a of areas as { id: string; name: string }[]) areaName.set(a.id, a.name);

    type AreaEntry = { areaId: string; areaName: string; recipeQty: number; countedAt: string };
    const byIngredient: Record<string, { total: number; areas: AreaEntry[] }> = {};

    for (const r of rows as { ingredientId: string; storageAreaId: string; recipeQty: unknown; countedAt: Date }[]) {
        const qty = Number(r.recipeQty);
        if (qty <= 0) continue;   // an area counted as 0 isn't "storing" the item
        const bucket = byIngredient[r.ingredientId] ?? { total: 0, areas: [] };
        bucket.total += qty;
        bucket.areas.push({
            areaId: r.storageAreaId,
            areaName: areaName.get(r.storageAreaId) ?? "Unknown area",
            recipeQty: qty,
            countedAt: r.countedAt.toISOString(),
        });
        byIngredient[r.ingredientId] = bucket;
    }

    for (const k of Object.keys(byIngredient)) {
        byIngredient[k].areas.sort((a, b) => b.recipeQty - a.recipeQty);
    }

    return NextResponse.json({ byIngredient });
}
