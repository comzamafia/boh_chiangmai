/**
 * PUT    /api/portion-standards/[id]  — update
 * DELETE /api/portion-standards/[id]  — delete
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";

const INCLUDE = {
    ingredient: {
        select: {
            id: true, name: true, sku: true, recipeUnit: true, groupId: true,
            category: { select: { id: true, name: true, sortOrder: true } },
        },
    },
};

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;

        const owned = await prisma.portionStandard.findFirst({ where: { id, branchId }, select: { id: true } });
        if (!owned) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const body = await request.json();
        const data: Record<string, unknown> = {};

        if (body.ingredientId !== undefined) data.ingredientId = body.ingredientId;
        if (body.itemName     !== undefined) data.itemName     = body.itemName.trim();
        if (body.type         !== undefined) data.type         = body.type;
        if (body.portionSize  !== undefined) data.portionSize  = Number(body.portionSize);
        if (body.portionUnit  !== undefined) data.portionUnit  = body.portionUnit.trim();
        if (body.notes        !== undefined) data.notes        = body.notes?.trim() || null;

        const row = await prisma.portionStandard.update({ where: { id }, data, include: INCLUDE });

        logAudit({
            session, action: "UPDATE", targetTable: "PortionStandard",
            targetId: row.id, targetName: `${row.ingredient.name} — ${row.itemName}`,
            newValues: data,
            branchId,
            request,
        });

        return NextResponse.json(row);
    } catch {
        return NextResponse.json({ error: "Failed to update portion standard" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
        const { id } = await params;

        const row = await prisma.portionStandard.findFirst({ where: { id, branchId }, include: INCLUDE });
        if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

        await prisma.portionStandard.delete({ where: { id } });

        logAudit({
            session, action: "DELETE", targetTable: "PortionStandard",
            targetId: id, targetName: `${row.ingredient.name} — ${row.itemName}`,
            branchId,
            request,
        });

        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete portion standard" }, { status: 500 });
    }
}
