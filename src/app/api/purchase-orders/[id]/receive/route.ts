/**
 * POST /api/purchase-orders/[id]/receive
 *   Receive goods against a PO and reconcile ordered vs received.
 *
 *   Body: {
 *     date: "YYYY-MM-DD",
 *     lines: [{ itemId, receivedQty, unitPrice? }]
 *   }
 *
 * For each line:
 *   - Stores receivedQty on the PurchaseOrderItem (ordered-vs-received variance).
 *   - If the line's ingredient is tracked in inventory, creates an "In"
 *     transaction (purchase qty → recipe units via conversionRate × yield%),
 *     bumps currentStock, and recomputes Moving Average Cost + purchasePrice.
 *
 * Finally sets PO status = "Received". Idempotent-ish: re-receiving overwrites
 * receivedQty but each call adds stock again, so the UI only allows it once
 * (status gate). Skips untracked / zero-qty lines gracefully.
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const { date, lines } = body as {
        date: string;
        lines: { itemId: string; receivedQty: number; unitPrice?: number }[];
    };

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
    }
    if (!Array.isArray(lines) || lines.length === 0) {
        return NextResponse.json({ error: "lines are required" }, { status: 400 });
    }

    const po = await prisma.purchaseOrder.findUnique({
        where: { id },
        include: { items: true },
    });
    if (!po) return NextResponse.json({ error: "Purchase order not found" }, { status: 404 });

    const lineById = new Map(lines.map(l => [l.itemId, l]));

    interface ReceiptResult {
        ingredientName: string;
        orderedQty:     number;
        receivedQty:    number;
        variance:       number;
        stockAdded:     number | null;   // null = ingredient not tracked
        priceAlert:     boolean;
    }
    const results: ReceiptResult[] = [];

    // Process each PO item that has a matching received line
    for (const item of po.items) {
        const line = lineById.get(item.id);
        if (!line) continue;

        const receivedQty = Number(line.receivedQty);
        const orderedQty  = Number(item.qty);
        const unitPrice   = line.unitPrice != null ? Number(line.unitPrice) : Number(item.unitPrice);

        // Always record receivedQty (even 0 = nothing arrived)
        await prisma.purchaseOrderItem.update({
            where: { id: item.id },
            data:  { receivedQty },
        });

        let stockAdded: number | null = null;
        let priceAlert = false;

        // Inventory effect only for tracked ingredients with a positive qty
        if (item.ingredientId && receivedQty > 0) {
            const ingredient = await prisma.ingredient.findUnique({
                where:   { id: item.ingredientId },
                include: { inventoryItem: true },
            });
            if (ingredient?.inventoryItem) {
                const inv          = ingredient.inventoryItem;
                const convRate     = Number(ingredient.conversionRate);
                const yieldPct     = Number(ingredient.yieldPercent) / 100;
                const added        = receivedQty * convRate * yieldPct;
                const totalPaid    = receivedQty * unitPrice;

                const oldUnitPrice = Number(ingredient.purchasePrice);
                priceAlert = oldUnitPrice > 0 && (unitPrice - oldUnitPrice) / oldUnitPrice > 0.10;

                // Moving Average Cost (per recipe unit)
                const curStock = Number(inv.currentStock);
                const curAvg   = Number(ingredient.averageCostPerBaseUnit ?? 0);
                const newAvg   = (curStock <= 0 || curAvg === 0)
                    ? (added > 0 ? totalPaid / added : 0)
                    : (curStock * curAvg + totalPaid) / (curStock + added);

                await prisma.$transaction([
                    prisma.inventoryTransaction.create({
                        data: {
                            inventoryItemId: inv.id,
                            ingredientId:    ingredient.id,
                            type:            "In",
                            qty:             added,
                            unit:            ingredient.recipeUnit,
                            costPerUnit:     added > 0 ? totalPaid / added : 0,
                            note:            `PO ${po.poNumber}`,
                            date,
                        },
                    }),
                    prisma.inventoryItem.update({
                        where: { id: inv.id },
                        data:  { currentStock: { increment: added } },
                    }),
                    prisma.ingredient.update({
                        where: { id: ingredient.id },
                        data:  { purchasePrice: unitPrice, averageCostPerBaseUnit: newAvg },
                    }),
                ]);
                stockAdded = added;
            }
        }

        results.push({
            ingredientName: item.ingredientName,
            orderedQty,
            receivedQty,
            variance: Math.round((receivedQty - orderedQty) * 10000) / 10000,
            stockAdded: stockAdded != null ? Math.round(stockAdded * 10000) / 10000 : null,
            priceAlert,
        });
    }

    // Mark PO received
    const updated = await prisma.purchaseOrder.update({
        where:   { id },
        data:    { status: "Received" },
        include: { items: true, supplier: { select: { id: true, name: true } } },
    });

    logAudit({
        session,
        action:      "RECEIVE",
        targetTable: "PurchaseOrder",
        targetId:    id,
        targetName:  `${po.poNumber} · ${po.supplierName}`,
        newValues:   { received: results.length, lines: results },
        request:     req,
    });

    return NextResponse.json({
        purchaseOrder: updated,
        results,
        receivedLines: results.length,
        anyPriceAlert: results.some(r => r.priceAlert),
    });
}
