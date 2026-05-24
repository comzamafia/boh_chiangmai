import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const INCLUDE = {
    ingredient: {
        include: { supplier: { select: { id: true, name: true } } },
    },
};

// GET /api/inventory — list all tracked inventory items
export async function GET() {
    try {
        const items = await prisma.inventoryItem.findMany({
            include: INCLUDE,
            orderBy: { ingredient: { name: "asc" } },
        });
        return NextResponse.json(items);
    } catch {
        return NextResponse.json({ error: "Failed to fetch inventory" }, { status: 500 });
    }
}

// POST /api/inventory — add ingredient to inventory tracking
export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { ingredientId, currentStock, parMin, parMax, reorderPoint, leadTimeDays, holdingDays } = body;
        if (!ingredientId) {
            return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });
        }
        const item = await prisma.inventoryItem.create({
            data: {
                ingredientId,
                currentStock: Number(currentStock ?? 0),
                parMin:       Number(parMin ?? 0),
                parMax:       Number(parMax ?? 0),
                reorderPoint: Number(reorderPoint ?? 0),
                leadTimeDays: Number(leadTimeDays ?? 1),
                holdingDays:  Number(holdingDays ?? 7),
            },
            include: INCLUDE,
        });
        return NextResponse.json(item, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Failed to create inventory item";
        // Unique constraint = already tracked
        if (msg.includes("Unique constraint")) {
            return NextResponse.json({ error: "Ingredient is already being tracked" }, { status: 409 });
        }
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
