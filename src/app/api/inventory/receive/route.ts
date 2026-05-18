import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/inventory/receive
 * Logs a goods receipt (Goods-In):
 *  1. Converts purchase qty → recipe units: stockAdded = purchaseQty × conversionRate × (yieldPercent/100)
 *  2. Creates an "In" InventoryTransaction
 *  3. Updates InventoryItem.currentStock
 *  4. Updates Ingredient.purchasePrice with the new unit price
 *  5. Returns priceAlert flag if new price is >10% above previous price
 */
export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const body = await request.json();
        const {
            ingredientId,
            purchaseQty,   // in purchase unit
            purchasePrice, // total price for the batch
            date,
            note,
            supplierId,    // optional: override supplier for this receipt
        } = body;

        if (!ingredientId || purchaseQty == null || purchasePrice == null || !date) {
            return NextResponse.json(
                { error: "ingredientId, purchaseQty, purchasePrice, date are required" },
                { status: 400 }
            );
        }

        // Load ingredient + inventory item
        const ingredient = await prisma.ingredient.findUnique({
            where: { id: ingredientId },
            include: { inventoryItem: true },
        });
        if (!ingredient) {
            return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
        }
        if (!ingredient.inventoryItem) {
            return NextResponse.json({ error: "Ingredient is not being tracked in inventory. Add it to tracking first." }, { status: 400 });
        }

        const convRate     = Number(ingredient.conversionRate);
        const yieldPct     = Number(ingredient.yieldPercent) / 100;
        const stockAdded   = Number(purchaseQty) * convRate * yieldPct;
        const newUnitPrice = Number(purchaseQty) > 0
            ? Number(purchasePrice) / Number(purchaseQty)
            : 0;
        const oldPrice    = Number(ingredient.purchasePrice);
        const priceChange = oldPrice > 0 ? (newUnitPrice - oldPrice) / oldPrice : 0;
        const priceAlert  = priceChange > 0.10; // >10% increase

        const invItem = ingredient.inventoryItem;

        await prisma.$transaction([
            // 1. Create In transaction
            prisma.inventoryTransaction.create({
                data: {
                    inventoryItemId: invItem.id,
                    ingredientId,
                    type:        "In",
                    qty:         stockAdded,
                    unit:        ingredient.recipeUnit,
                    costPerUnit: stockAdded > 0 ? Number(purchasePrice) / stockAdded : 0,
                    note:        note ?? null,
                    date,
                },
            }),
            // 2. Update currentStock
            prisma.inventoryItem.update({
                where: { id: invItem.id },
                data:  { currentStock: { increment: stockAdded } },
            }),
            // 3. Update ingredient purchase price
            prisma.ingredient.update({
                where: { id: ingredientId },
                data:  {
                    purchasePrice: Number(purchasePrice),
                    ...(supplierId ? { supplierId } : {}),
                },
            }),
        ]);

        // Fetch updated item to return
        const updatedItem = await prisma.inventoryItem.findUnique({
            where: { id: invItem.id },
            include: {
                ingredient: { include: { supplier: { select: { id: true, name: true } } } },
            },
        });

        logAudit({
            session, action: "RECEIVE", targetTable: "InventoryTransaction",
            targetId: invItem.id, targetName: ingredient.name,
            newValues: {
                ingredientId, purchaseQty, purchasePrice, stockAdded,
                date, supplierId, priceAlert,
                oldPurchasePrice: oldPrice, newUnitPrice,
            },
            request,
        });

        return NextResponse.json({
            inventoryItem: updatedItem,
            stockAdded,
            priceAlert,
            priceChangePct: Math.round(priceChange * 100),
        }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to process goods receipt" }, { status: 500 });
    }
}
