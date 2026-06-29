import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/inventory/receive
 * Logs a goods receipt (Goods-In):
 *  1. Converts purchase qty → recipe units: stockAdded = purchaseQty × conversionRate × (yieldPercent/100)
 *  2. Creates an "In" InventoryTransaction
 *  3. Updates InventoryItem.currentStock
 *  4. Updates Ingredient.purchasePrice with the new unit price
 *  5. Calculates Moving Average Cost (MAC) and updates Ingredient.averageCostPerBaseUnit
 *  6. Returns priceAlert flag if new price is >10% above previous price
 *
 * V3: Supports ingredientSupplierId to pull purchase details from a linked supplier.
 */
export async function POST(request: Request) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;

        const body = await request.json();
        const {
            ingredientId,
            purchaseQty,           // in purchase unit
            purchasePrice,         // total price for the batch
            date,
            note,
            supplierId,            // optional: override primary supplier
            ingredientSupplierId,  // V3: select from linked IngredientSupplier records
        } = body;

        if (!ingredientId || purchaseQty == null || purchasePrice == null || !date) {
            return NextResponse.json(
                { error: "ingredientId, purchaseQty, purchasePrice, date are required" },
                { status: 400 }
            );
        }

        // Load ingredient + inventory item + current MAC
        const ingredient = await prisma.ingredient.findFirst({
            where: { id: ingredientId, branchId },
            include: { inventoryItem: true },
        });
        if (!ingredient) {
            return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });
        }
        if (!ingredient.inventoryItem) {
            return NextResponse.json({ error: "Ingredient is not being tracked in inventory. Add it to tracking first." }, { status: 400 });
        }

        // If an ingredientSupplierId is given, validate it belongs to this ingredient
        if (ingredientSupplierId) {
            const link = await prisma.ingredientSupplier.findFirst({ where: { id: ingredientSupplierId, branchId } });
            if (!link || link.ingredientId !== ingredientId) {
                return NextResponse.json({ error: "Invalid ingredientSupplierId for this ingredient" }, { status: 400 });
            }
        }

        const convRate   = Number(ingredient.conversionRate);
        const yieldPct   = Number(ingredient.yieldPercent) / 100;
        const stockAdded = Number(purchaseQty) * convRate * yieldPct;

        const newUnitPrice = Number(purchaseQty) > 0
            ? Number(purchasePrice) / Number(purchaseQty)
            : 0;
        const oldPrice    = Number(ingredient.purchasePrice);
        const priceChange = oldPrice > 0 ? (newUnitPrice - oldPrice) / oldPrice : 0;
        const priceAlert  = priceChange > 0.10; // >10% increase

        // ── MAC Calculation ────────────────────────────────────────────────────
        // Formula: newAvgCost = (currentStock × currentAvgCost + totalPaid) / (currentStock + stockAdded)
        // All quantities in base (recipe) units.
        const invItem        = ingredient.inventoryItem;
        const currentStock   = Number(invItem.currentStock);
        const currentAvgCost = Number(ingredient.averageCostPerBaseUnit ?? 0);
        const totalPaid      = Number(purchasePrice);

        let newAvgCost: number;
        if (currentStock <= 0 || currentAvgCost === 0) {
            // First receive or zero stock — set directly from this receipt
            newAvgCost = stockAdded > 0 ? totalPaid / stockAdded : 0;
        } else {
            newAvgCost = (currentStock * currentAvgCost + totalPaid) / (currentStock + stockAdded);
        }

        await prisma.$transaction([
            // 1. Create In transaction
            prisma.inventoryTransaction.create({
                data: {
                    inventoryItemId: invItem.id,
                    ingredientId,
                    type:        "In",
                    qty:         stockAdded,
                    unit:        ingredient.recipeUnit,
                    costPerUnit: stockAdded > 0 ? totalPaid / stockAdded : 0,
                    note:        note ?? null,
                    date,
                    branchId,
                },
            }),
            // 2. Update currentStock
            prisma.inventoryItem.update({
                where: { id: invItem.id },
                data:  { currentStock: { increment: stockAdded } },
            }),
            // 3. Update ingredient: purchase price + MAC + optional supplier
            prisma.ingredient.update({
                where: { id: ingredientId },
                data:  {
                    purchasePrice:          Number(purchasePrice),
                    averageCostPerBaseUnit: newAvgCost,
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
                ingredientId, purchaseQty, purchasePrice, stockAdded, date,
                supplierId, ingredientSupplierId, priceAlert,
                oldPurchasePrice: oldPrice, newUnitPrice,
                oldAvgCost: currentAvgCost, newAvgCost,
            },
            branchId,
            request,
        });

        return NextResponse.json({
            inventoryItem: updatedItem,
            stockAdded,
            priceAlert,
            priceChangePct: Math.round(priceChange * 100),
            newAvgCost,
        }, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to process goods receipt" }, { status: 500 });
    }
}
