import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// PUT /api/ingredient-suppliers/[id] — update a supplier link
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { purchasePrice, purchaseUnit, conversionRate, isPreferred, notes } = await req.json();

    const existing = await prisma.ingredientSupplier.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
        // If setting this as preferred, unset any others for the same ingredient
        if (isPreferred === true && !existing.isPreferred) {
            await tx.ingredientSupplier.updateMany({
                where: { ingredientId: existing.ingredientId, branchId, isPreferred: true },
                data: { isPreferred: false },
            });
        }
        return tx.ingredientSupplier.update({
            where: { id },
            data: {
                ...(purchasePrice !== undefined ? { purchasePrice } : {}),
                ...(purchaseUnit !== undefined ? { purchaseUnit } : {}),
                ...(conversionRate !== undefined ? { conversionRate } : {}),
                ...(isPreferred !== undefined ? { isPreferred } : {}),
                ...(notes !== undefined ? { notes: notes?.trim() || null } : {}),
            },
            include: { supplier: { select: { id: true, name: true } } },
        });
    });

    return NextResponse.json(result);
}

// DELETE /api/ingredient-suppliers/[id] — remove a supplier link
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.ingredientSupplier.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.ingredientSupplier.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
