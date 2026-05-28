/**
 * GET  /api/inventory/par-suggestions?days=7
 *   Compute Average Daily Usage (ADU) from InventoryTransaction "Out" records
 *   and suggest PAR Min, ROP, and PAR Max for each tracked ingredient.
 *
 * POST /api/inventory/par-suggestions
 *   Apply selected suggestions to InventoryItem records.
 *   Body: { items: [{ inventoryItemId, parMin, parMax, reorderPoint }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { calculateLeadTime } from "@/lib/supplier-lead-time";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(searchParams.get("days") ?? 7)));

    // Date window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

    // Load all inventory items with ingredient details + supplier schedule
    const inventoryItems = await prisma.inventoryItem.findMany({
        include: {
            ingredient: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    recipeUnit: true,
                    groupId: true,
                    categoryId: true,
                    category: { select: { id: true, name: true } },
                    supplier: {
                        select: {
                            id: true,
                            name: true,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            deliveryDays:         true as any,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            orderCutoffTime:      true as any,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            orderCutoffDayOffset: true as any,
                        },
                    },
                },
            },
        },
        orderBy: { ingredient: { name: "asc" } },
    });

    // Load "Out" transactions within the window for all tracked ingredients
    const ingredientIds = inventoryItems.map(iv => iv.ingredientId);
    const outTxns = await prisma.inventoryTransaction.findMany({
        where: {
            ingredientId: { in: ingredientIds },
            type:         "Out",
            date:         { gte: cutoffStr },
        },
        select: { ingredientId: true, qty: true },
    });

    // Sum "Out" qty per ingredient
    const outMap = new Map<string, number>();
    for (const txn of outTxns) {
        outMap.set(txn.ingredientId, (outMap.get(txn.ingredientId) ?? 0) + Number(txn.qty));
    }

    // Build suggestions
    const now = new Date();
    const suggestions = inventoryItems.map(iv => {
        const totalOut = outMap.get(iv.ingredientId) ?? 0;
        const adu = totalOut / days;  // Average Daily Usage in recipe units

        const currentParMin = Number(iv.parMin);
        const currentParMax = Number(iv.parMax);
        const currentROP    = Number(iv.reorderPoint);
        const flatLeadTime  = iv.leadTimeDays;
        const holdDays      = iv.holdingDays;

        // Compute effective lead time from supplier schedule if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sup = (iv.ingredient as any).supplier as
            | { id: string; name: string; deliveryDays: number[]; orderCutoffTime: string | null; orderCutoffDayOffset: number }
            | null
            | undefined;

        const lt = calculateLeadTime({
            deliveryDays:         sup?.deliveryDays ?? [],
            orderCutoffTime:      sup?.orderCutoffTime ?? null,
            orderCutoffDayOffset: sup?.orderCutoffDayOffset ?? 1,
            leadTimeFallback:     flatLeadTime,
        }, now);

        // PAR Min uses worst-case lead time (safety stock must cover the longest possible wait)
        // ROP uses worst-case lead too: ROP = (ADU × worstCase) + safety stock (= parMin)
        // PAR Max uses holdDays as before (how many days of stock to hold on hand)
        const r = (n: number) => Math.round(n * 100) / 100;
        const ltForSafety = Math.max(lt.worstCaseLeadDays, 1);
        const suggestedParMin = r(adu * Math.max(ltForSafety, 2));
        const suggestedROP    = r((adu * ltForSafety) + currentParMin);
        const suggestedParMax = r(adu * holdDays);

        const hasHistory = totalOut > 0;

        return {
            inventoryItemId:  iv.id,
            ingredientId:     iv.ingredientId,
            ingredientName:   iv.ingredient.name,
            sku:              iv.ingredient.sku,
            unit:             iv.ingredient.recipeUnit,
            groupId:          iv.ingredient.groupId,
            categoryId:       iv.ingredient.categoryId,
            categoryName:     iv.ingredient.category?.name ?? "Uncategorized",

            // History
            daysAnalyzed:     days,
            totalOutQty:      r(totalOut),
            adu:              r(adu),
            hasHistory,

            // Current limits
            currentParMin,
            currentParMax,
            currentROP,
            leadTimeDays:     flatLeadTime,
            holdingDays:      holdDays,
            currentStock:     Number(iv.currentStock),

            // Supplier-driven lead time
            supplierName:           sup?.name ?? null,
            scheduleBasedLeadDays:  lt.worstCaseLeadDays,
            scheduleEffectiveDays:  lt.effectiveLeadDays,
            scheduleFallback:       lt.fallback,
            nextDeliveryDate:       lt.nextDeliveryDate?.toISOString().slice(0, 10) ?? null,
            nextOrderBy:            lt.nextOrderBy?.toISOString() ?? null,

            // Suggested limits
            suggestedParMin: hasHistory ? suggestedParMin : null,
            suggestedROP:    hasHistory ? suggestedROP    : null,
            suggestedParMax: hasHistory ? suggestedParMax : null,
        };
    });

    return NextResponse.json({
        days,
        cutoffDate: cutoffStr,
        suggestions,
        totalTracked: inventoryItems.length,
        withHistory:  suggestions.filter(s => s.hasHistory).length,
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const items: { inventoryItemId: string; parMin: number; parMax: number; reorderPoint: number }[] =
        body.items ?? [];

    if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    const updated: string[] = [];

    for (const it of items) {
        const { inventoryItemId, parMin, parMax, reorderPoint } = it;
        if (!inventoryItemId) continue;

        await prisma.inventoryItem.update({
            where: { id: inventoryItemId },
            data: {
                parMin:       Number(parMin),
                parMax:       Number(parMax),
                reorderPoint: Number(reorderPoint),
            },
        });
        updated.push(inventoryItemId);
    }

    logAudit({
        session,
        action:      "UPDATE",
        targetTable: "InventoryItem",
        targetId:    "bulk",
        targetName:  `PAR suggestions applied (${updated.length} items)`,
        newValues:   { appliedCount: updated.length },
        request:     req,
    });

    return NextResponse.json({ applied: updated.length });
}
