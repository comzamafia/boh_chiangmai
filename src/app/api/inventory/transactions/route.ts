import { prisma } from "@/lib/db";
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

        return NextResponse.json(txn, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create transaction" }, { status: 500 });
    }
}
