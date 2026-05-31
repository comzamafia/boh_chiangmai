/**
 * POST /api/pmix/deplete-inventory
 *   Body: { uploadId: string; date: string }
 *
 * Explodes each sold menu item (PmixItem.qtySold) into ingredient consumption
 * via its linked Recipe's BOM, then writes "Out" inventory transactions and
 * decrements currentStock — so on-hand stock tracks sales automatically.
 *
 * Per-serving consumption of an ingredient =
 *     RecipeIngredient.quantity / Recipe.yieldAmount       (recipe units)
 * Total deducted = perServing × PmixItem.qtySold, summed across all dishes.
 *
 * IDEMPOTENT: every auto-deduction is tagged
 *     note = "autodeplete:{uploadId}:{date}"
 * Re-running first REVERSES the previous run (adds the qty back) then
 * re-applies, so syncing the same upload/date twice never double-counts.
 *
 * Only ingredients that are tracked in InventoryItem are touched.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager", "analyst"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { uploadId, date } = await req.json();
    if (!uploadId || !date) {
        return NextResponse.json({ error: "uploadId and date are required" }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    const tag = `autodeplete:${uploadId}:${date}`;

    // 1. Sold items with a linked recipe
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;
    const pmixItems: { recipeId: string | null; qtySold: number }[] = await db.pmixItem.findMany({
        where:  { uploadId, qtySold: { gt: 0 }, recipeId: { not: null } },
        select: { recipeId: true, qtySold: true },
    });

    if (pmixItems.length === 0) {
        // Still reverse any prior deduction so toggling off works
        await reversePrior(tag);
        return NextResponse.json({ depleted: 0, lines: [], skippedNoRecipe: 0, message: "No recipe-linked sales to deplete" });
    }

    // Sum qtySold per recipe
    const soldByRecipe = new Map<string, number>();
    for (const it of pmixItems) {
        if (!it.recipeId) continue;
        soldByRecipe.set(it.recipeId, (soldByRecipe.get(it.recipeId) ?? 0) + Number(it.qtySold));
    }

    // 2. Load those recipes + BOM + ingredient unit + inventory item
    const recipes = await prisma.recipe.findMany({
        where: { id: { in: [...soldByRecipe.keys()] } },
        select: {
            id: true,
            yieldAmount: true,
            ingredients: {
                select: {
                    ingredientId: true,
                    quantity:     true,
                    ingredient: {
                        select: {
                            name:       true,
                            recipeUnit: true,
                            inventoryItem: { select: { id: true, currentStock: true } },
                        },
                    },
                },
            },
        },
    });

    // 3. Aggregate consumption per ingredient (only tracked ones)
    interface Line {
        ingredientId:    string;
        inventoryItemId: string;
        name:            string;
        unit:            string;
        qty:             number;   // recipe units to deduct
    }
    const byIngredient = new Map<string, Line>();
    let skippedNoStandard = 0;

    for (const recipe of recipes) {
        const sold  = soldByRecipe.get(recipe.id) ?? 0;
        const yield_ = Number(recipe.yieldAmount) || 1;
        for (const ri of recipe.ingredients) {
            const inv = ri.ingredient.inventoryItem;
            if (!inv) { skippedNoStandard++; continue; }   // not tracked → skip
            const perServing = Number(ri.quantity) / yield_;
            const consumed   = perServing * sold;
            if (consumed <= 0) continue;

            const existing = byIngredient.get(ri.ingredientId);
            if (existing) {
                existing.qty += consumed;
            } else {
                byIngredient.set(ri.ingredientId, {
                    ingredientId:    ri.ingredientId,
                    inventoryItemId: inv.id,
                    name:            ri.ingredient.name,
                    unit:            ri.ingredient.recipeUnit,
                    qty:             consumed,
                });
            }
        }
    }

    // 4. Reverse any prior auto-deduction for this upload+date
    await reversePrior(tag);

    // 5. Apply new deductions (transaction + stock decrement) atomically
    const lines = [...byIngredient.values()].map(l => ({ ...l, qty: round4(l.qty) }))
        .filter(l => l.qty > 0);

    if (lines.length > 0) {
        await prisma.$transaction(
            lines.flatMap(l => [
                prisma.inventoryTransaction.create({
                    data: {
                        inventoryItemId: l.inventoryItemId,
                        ingredientId:    l.ingredientId,
                        type:            "Out",
                        qty:             l.qty,
                        unit:            l.unit,
                        date,
                        note:            tag,
                    },
                }),
                prisma.inventoryItem.update({
                    where: { id: l.inventoryItemId },
                    data:  { currentStock: { decrement: l.qty } },
                }),
            ])
        );
    }

    return NextResponse.json({
        depleted: lines.length,
        lines:    lines.map(l => ({ name: l.name, qty: l.qty, unit: l.unit })),
        skippedNotTracked: skippedNoStandard,
        date,
        uploadId,
    });
}

/** Reverse a prior auto-deduction run: add qty back to stock, delete the txns. */
async function reversePrior(tag: string): Promise<void> {
    const prior = await prisma.inventoryTransaction.findMany({
        where:  { type: "Out", note: tag },
        select: { id: true, inventoryItemId: true, qty: true },
    });
    if (prior.length === 0) return;

    await prisma.$transaction([
        ...prior.map(p =>
            prisma.inventoryItem.update({
                where: { id: p.inventoryItemId },
                data:  { currentStock: { increment: Number(p.qty) } },
            })
        ),
        prisma.inventoryTransaction.deleteMany({ where: { id: { in: prior.map(p => p.id) } } }),
    ]);
}

function round4(n: number): number {
    return Math.round(n * 10000) / 10000;
}
