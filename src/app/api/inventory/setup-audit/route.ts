/**
 * GET /api/inventory/setup-audit
 *
 * Returns categorized setup issues for ingredients & inventory items so
 * managers can quickly spot and fix data-quality problems that affect
 * stock counting and tracking accuracy.
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export const dynamic = "force-dynamic";

const STALE_DAYS = 14;

export async function GET() {
    const session = await getSession();
    if (!session || !["admin", "manager", "chef"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [ingredients, inventoryItems, areas] = await Promise.all([
        db.ingredient.findMany({
            select: {
                id: true, name: true, supplierId: true, storageAreaId: true,
                purchaseUnit: true, recipeUnit: true, conversionRate: true,
                storageArea: { select: { name: true } },
                supplier: { select: { name: true } },
                category: { select: { name: true } },
            },
        }),
        db.inventoryItem.findMany({
            select: {
                id: true, ingredientId: true, parMin: true, reorderPoint: true,
                lastCountDate: true,
            },
        }),
        db.storageArea.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
    ]);

    const trackedSet = new Set<string>();
    const invByIngId = new Map<string, { id: string; parMin: number; reorderPoint: number; lastCountDate: Date | null }>();
    for (const inv of inventoryItems) {
        trackedSet.add(inv.ingredientId);
        invByIngId.set(inv.ingredientId, {
            id: inv.id,
            parMin: Number(inv.parMin),
            reorderPoint: Number(inv.reorderPoint),
            lastCountDate: inv.lastCountDate,
        });
    }

    const staleCutoff = new Date(Date.now() - STALE_DAYS * 86400000);

    type Item = { id: string; name: string; category: string | null; area: string | null; supplier: string | null };
    const toItem = (i: typeof ingredients[0]): Item => ({
        id: i.id, name: i.name,
        category: i.category?.name ?? null,
        area: i.storageArea?.name ?? null,
        supplier: i.supplier?.name ?? null,
    });

    const noStorageArea: Item[] = [];
    const notTracked: Item[] = [];
    const noPar: (Item & { inventoryItemId: string })[] = [];
    const noSupplier: Item[] = [];
    const suspectConversion: (Item & { purchaseUnit: string; recipeUnit: string })[] = [];
    const neverCounted: Item[] = [];
    const staleCount: (Item & { lastCountDate: string })[] = [];

    for (const ing of ingredients) {
        const item = toItem(ing);
        const tracked = trackedSet.has(ing.id);
        const inv = invByIngId.get(ing.id);

        if (!ing.supplierId) noSupplier.push(item);

        if (tracked && !ing.storageAreaId) noStorageArea.push(item);

        if (!tracked) {
            notTracked.push(item);
            continue;
        }

        if (inv) {
            if (inv.parMin === 0 && inv.reorderPoint === 0) {
                noPar.push({ ...item, inventoryItemId: inv.id });
            }
            if (!inv.lastCountDate) {
                neverCounted.push(item);
            } else if (inv.lastCountDate < staleCutoff) {
                staleCount.push({ ...item, lastCountDate: inv.lastCountDate.toISOString().slice(0, 10) });
            }
        }

        if (Number(ing.conversionRate) === 1 && ing.purchaseUnit !== ing.recipeUnit) {
            suspectConversion.push({ ...item, purchaseUnit: ing.purchaseUnit, recipeUnit: ing.recipeUnit });
        }
    }

    return NextResponse.json({
        totalIngredients: ingredients.length,
        totalTracked: trackedSet.size,
        areas: areas.map((a: { id: string; name: string }) => ({ id: a.id, name: a.name })),
        issues: {
            noStorageArea: { count: noStorageArea.length, items: noStorageArea },
            notTracked: { count: notTracked.length, items: notTracked },
            noPar: { count: noPar.length, items: noPar },
            noSupplier: { count: noSupplier.length, items: noSupplier },
            suspectConversion: { count: suspectConversion.length, items: suspectConversion },
            neverCounted: { count: neverCounted.length, items: neverCounted },
            staleCount: { count: staleCount.length, items: staleCount },
        },
    });
}
