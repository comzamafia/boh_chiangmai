import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

const INCLUDE = {
    ingredient: {
        include: {
            supplier: { select: { id: true, name: true } },
            category: { select: { id: true, name: true } },
        },
    },
};

// GET /api/inventory/[id]
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const item = await prisma.inventoryItem.findUnique({ where: { id }, include: INCLUDE });
        if (!item) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed to fetch inventory item" }, { status: 500 });
    }
}

// PUT /api/inventory/[id] — update PAR levels / lead time
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const data: Record<string, unknown> = {};
        if (body.parMin        !== undefined) data.parMin        = Number(body.parMin);
        if (body.parMax        !== undefined) data.parMax        = Number(body.parMax);
        if (body.reorderPoint  !== undefined) data.reorderPoint  = Number(body.reorderPoint);
        if (body.leadTimeDays  !== undefined) data.leadTimeDays  = Number(body.leadTimeDays);
        if (body.holdingDays   !== undefined) data.holdingDays   = Number(body.holdingDays);
        if (body.currentStock  !== undefined) data.currentStock  = Number(body.currentStock);
        if (body.lastCountDate !== undefined) data.lastCountDate = body.lastCountDate ? new Date(body.lastCountDate) : null;
        // Pack / case counting layer
        if (body.packUnit !== undefined) data.packUnit = body.packUnit ? String(body.packUnit).trim() : null;
        if (body.packSize !== undefined) data.packSize = (body.packSize === null || body.packSize === "") ? null : Number(body.packSize);

        const item = await prisma.inventoryItem.update({ where: { id }, data, include: INCLUDE });
        return NextResponse.json(item);
    } catch {
        return NextResponse.json({ error: "Failed to update inventory item" }, { status: 500 });
    }
}

// DELETE /api/inventory/[id] — remove from tracking
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.inventoryItem.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete inventory item" }, { status: 500 });
    }
}
