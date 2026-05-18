import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/inventory/alerts — items at or below reorderPoint or parMin
export async function GET() {
    try {
        const items = await prisma.inventoryItem.findMany({
            include: {
                ingredient: {
                    include: { supplier: { select: { id: true, name: true } } },
                },
            },
            orderBy: { currentStock: "asc" },
        });

        const alerts = items
            .filter(item => Number(item.currentStock) <= Number(item.reorderPoint))
            .map(item => {
                const current     = Number(item.currentStock);
                const reorder     = Number(item.reorderPoint);
                const safetyStock = Number(item.parMin);
                const status      = current <= safetyStock ? "critical" : "low";
                const qtyToOrder  = Math.max(0, Number(item.parMax) - current);

                return {
                    ...item,
                    status,
                    qtyToOrder,
                    suggestedSupplierId:   item.ingredient.supplierId,
                    suggestedSupplierName: item.ingredient.supplier?.name ?? "",
                };
            });

        return NextResponse.json(alerts);
    } catch {
        return NextResponse.json({ error: "Failed to fetch alerts" }, { status: 500 });
    }
}
