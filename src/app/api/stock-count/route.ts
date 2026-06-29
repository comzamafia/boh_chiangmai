/**
 * GET  /api/stock-count?areaId=X
 *   → { counts: { [ingredientId]: recipeQty }, lastCountedAt: string | null }
 *     the latest per-area physical counts for one storage area.
 *
 * POST /api/stock-count
 *   body: { areaId, counts: [{ ingredientId, recipeQty }] }
 *   Upserts each per-area count, then rolls up each ingredient's total
 *   (sum across ALL areas) into its InventoryItem.currentStock via a
 *   Stocktake transaction (keeps variance history).
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const areaId = new URL(req.url).searchParams.get("areaId");
    if (!areaId) return NextResponse.json({ error: "areaId is required" }, { status: 400 });

    const rows = await db.storageAreaCount.findMany({ where: { storageAreaId: areaId, branchId } });
    const counts: Record<string, number> = {};
    let lastCountedAt: string | null = null;
    for (const r of rows as { ingredientId: string; recipeQty: unknown; countedAt: Date }[]) {
        counts[r.ingredientId] = Number(r.recipeQty);
        const t = r.countedAt.toISOString();
        if (!lastCountedAt || t > lastCountedAt) lastCountedAt = t;
    }
    return NextResponse.json({ counts, lastCountedAt });
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const body = await req.json();
    const areaId: string = body.areaId;
    const counts: { ingredientId: string; recipeQty: number }[] = Array.isArray(body.counts) ? body.counts : [];
    if (!areaId) return NextResponse.json({ error: "areaId is required" }, { status: 400 });
    if (counts.length === 0) return NextResponse.json({ ok: true, updated: 0 });

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const updated: { ingredientId: string; currentStock: number }[] = [];

    for (const c of counts) {
        if (!c.ingredientId) continue;
        const qty = Number(c.recipeQty) || 0;

        // 1. Upsert this area's count for the ingredient
        await db.storageAreaCount.upsert({
            where:  { ingredientId_storageAreaId: { ingredientId: c.ingredientId, storageAreaId: areaId } },
            update: { recipeQty: qty, countedAt: now },
            create: { ingredientId: c.ingredientId, storageAreaId: areaId, recipeQty: qty, countedAt: now, branchId },
        });

        // 2. Roll up the total across all areas → currentStock (Stocktake txn)
        const all = await db.storageAreaCount.findMany({ where: { ingredientId: c.ingredientId, branchId }, select: { recipeQty: true } });
        const total = all.reduce((s: number, r: { recipeQty: unknown }) => s + Number(r.recipeQty), 0);

        const invItem = await db.inventoryItem.findFirst({
            where:  { ingredientId: c.ingredientId, branchId },
            select: { id: true, currentStock: true, ingredient: { select: { recipeUnit: true } } },
        });
        if (!invItem) continue;
        const prevStock = Number(invItem.currentStock);

        await db.$transaction([
            db.inventoryTransaction.create({
                data: {
                    inventoryItemId: invItem.id,
                    ingredientId:    c.ingredientId,
                    type:            "Stocktake",
                    qty:             total,
                    unit:            invItem.ingredient.recipeUnit,
                    varianceQty:     total - prevStock,
                    note:            `Area count rolled up across storage areas → ${total} ${invItem.ingredient.recipeUnit}`,
                    date:            dateStr,
                    branchId,
                },
            }),
            db.inventoryItem.update({ where: { id: invItem.id }, data: { currentStock: total, lastCountDate: now } }),
        ]);
        updated.push({ ingredientId: c.ingredientId, currentStock: total });
    }

    return NextResponse.json({ ok: true, updated });
}
