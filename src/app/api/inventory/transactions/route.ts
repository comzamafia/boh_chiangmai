import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { fireCriticalStockCheck } from "@/lib/notifications/triggers/critical-stock";
import { NextResponse } from "next/server";

const SIGN: Record<string, number> = {
    In:        +1,
    Out:       -1,
    Waste:     -1,
    Adjust:    +1,  // qty can be negative for downward adjustments — caller decides
    Stocktake:  0,  // special: replaces stock, doesn't add/subtract
};

// GET /api/inventory/transactions — list with optional filters
export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const type         = searchParams.get("type");        // "In"|"Out"|"Waste"|"Adjust"|"Stocktake"
        const ingredientId = searchParams.get("ingredientId");
        const from         = searchParams.get("from");        // YYYY-MM-DD
        const to           = searchParams.get("to");          // YYYY-MM-DD
        const limitStr     = searchParams.get("limit");
        const limit        = limitStr ? parseInt(limitStr) : 200;

        const txns = await prisma.inventoryTransaction.findMany({
            where: {
                ...(type         ? { type }         : {}),
                ...(ingredientId ? { ingredientId } : {}),
                ...(from || to   ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
            },
            include: {
                ingredient: { select: { id: true, name: true, recipeUnit: true } },
            },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }],
            take: limit,
        });
        return NextResponse.json(txns);
    } catch {
        return NextResponse.json({ error: "Failed to fetch transactions" }, { status: 500 });
    }
}

// POST /api/inventory/transactions — create a new transaction and update stock
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await request.json();
        const { inventoryItemId, ingredientId, type, qty, unit, costPerUnit, reason, note, date, recipeId } = body;

        if (!inventoryItemId || !ingredientId || !type || qty == null || !date) {
            return NextResponse.json(
                { error: "inventoryItemId, ingredientId, type, qty, date are required" },
                { status: 400 }
            );
        }

        const qtyNum = Number(qty);
        const sign   = SIGN[type] ?? 0;

        // Capture prev stock to detect critical-threshold crossing for notifications
        const prevItem = await prisma.inventoryItem.findUnique({
            where:  { id: inventoryItemId },
            select: { currentStock: true },
        });
        const prevStock = prevItem ? Number(prevItem.currentStock) : undefined;

        const [txn] = await prisma.$transaction([
            prisma.inventoryTransaction.create({
                data: {
                    inventoryItemId,
                    ingredientId,
                    type,
                    qty:         qtyNum,
                    unit:        unit ?? "",
                    costPerUnit: costPerUnit != null ? Number(costPerUnit) : null,
                    reason:      reason ?? null,
                    note:        note ?? null,
                    date,
                    recipeId:    recipeId ?? null,
                    // Stocktake variance = counted − expected (negative = shrinkage)
                    varianceQty: (type === "Stocktake" && prevStock != null)
                        ? Math.round((qtyNum - prevStock) * 10000) / 10000
                        : null,
                },
                include: {
                    ingredient: { select: { id: true, name: true, recipeUnit: true } },
                },
            }),
            // Update currentStock on the InventoryItem
            type === "Stocktake"
                ? prisma.inventoryItem.update({
                    where: { id: inventoryItemId },
                    data:  { currentStock: qtyNum, lastCountDate: new Date() },
                })
                : prisma.inventoryItem.update({
                    where: { id: inventoryItemId },
                    data:  { currentStock: { increment: sign * qtyNum } },
                }),
        ]);

        // Audit WASTE_LOG separately (non-blocking)
        if (type === "Waste") {
            const ingName = txn.ingredient?.name ?? ingredientId;
            logAudit({
                session, action: "WASTE_LOG", targetTable: "InventoryTransaction",
                targetId: txn.id, targetName: ingName,
                newValues: { ingredientId, qty: qtyNum, unit, reason, costPerUnit, date },
                request,
            });
        }

        // Fire-and-forget critical stock alert (only for stock-reducing txns)
        if (type === "Out" || type === "Waste" || type === "Stocktake" || type === "Adjust") {
            const ingName = txn.ingredient?.name ?? "ingredient";
            const human =
                type === "Stocktake"
                    ? `Stocktake set stock to ${qtyNum}${unit ? ` ${unit}` : ""}`
                    : `${type}: ${Math.abs(qtyNum)}${unit ? ` ${unit}` : ""} of ${ingName}${reason ? ` (${reason})` : ""}`;
            fireCriticalStockCheck({
                inventoryItemId,
                triggeredBy: human,
                prevStock,
            });
        }

        return NextResponse.json(txn, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
    }
}
