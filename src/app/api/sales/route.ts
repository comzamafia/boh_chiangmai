import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const date = searchParams.get("date");
        const entries = await prisma.salesEntry.findMany({
            where: date ? { date } : undefined,
            orderBy: { createdAt: "asc" },
        });
        return NextResponse.json(entries);
    } catch {
        return NextResponse.json({ error: "Failed to fetch sales" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { date, recipeId, recipeName, qty, unitPrice, unitCost, notes } = body;
        if (!date || !recipeName || !qty || !unitPrice) {
            return NextResponse.json({ error: "date, recipeName, qty, unitPrice are required" }, { status: 400 });
        }
        const revenue   = Number(qty) * Number(unitPrice);
        const saleQty   = Number(qty);

        const entry = await prisma.salesEntry.create({
            data: {
                date,
                recipeId: recipeId ?? null,
                recipeName,
                qty:      saleQty,
                unitPrice: Number(unitPrice),
                revenue,
                unitCost: unitCost != null ? Number(unitCost) : null,
                notes:    notes ?? null,
            },
        });

        // ── Auto-deduct inventory stock from recipe BOM ───────────────────────
        if (recipeId) {
            try {
                const recipeIngredients = await prisma.recipeIngredient.findMany({
                    where:   { recipeId },
                    include: { ingredient: { include: { inventoryItem: true } } },
                });

                const deductOps = recipeIngredients
                    .filter(ri => ri.ingredient.inventoryItem != null)
                    .flatMap(ri => {
                        const invItem  = ri.ingredient.inventoryItem!;
                        const deductQty = Number(ri.quantity) * saleQty;
                        return [
                            prisma.inventoryTransaction.create({
                                data: {
                                    inventoryItemId: invItem.id,
                                    ingredientId:    ri.ingredientId,
                                    type:            "Out",
                                    qty:             deductQty,
                                    unit:            ri.ingredient.recipeUnit,
                                    date,
                                    recipeId,
                                    note:            `Auto: sale of ${recipeName} ×${saleQty}`,
                                },
                            }),
                            prisma.inventoryItem.update({
                                where: { id: invItem.id },
                                data:  { currentStock: { decrement: deductQty } },
                            }),
                        ];
                    });

                if (deductOps.length > 0) {
                    await prisma.$transaction(deductOps);
                }
            } catch {
                // Stock deduction is best-effort; don't fail the sale if inventory isn't tracked
            }
        }

        return NextResponse.json(entry, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create sales entry" }, { status: 500 });
    }
}
