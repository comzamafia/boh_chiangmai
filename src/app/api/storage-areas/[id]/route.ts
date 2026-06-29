import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// PUT /api/storage-areas/[id] — update (admin only)
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const existing = await prisma.storageArea.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Storage area not found" }, { status: 404 });

    const body = await req.json();
    const { name, temperature, isActive, sortOrder } = body;
    // Notification routing fields (optional)
    const { notifyEnabled, alertThreshold, digestSchedule, digestHourLocal, digestDayOfWeek } = body;

    try {
        const area = await prisma.storageArea.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(temperature !== undefined ? { temperature: temperature?.trim() || null } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
                ...(sortOrder !== undefined ? { sortOrder } : {}),
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(notifyEnabled   !== undefined ? { notifyEnabled }   : {}) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(alertThreshold  !== undefined ? { alertThreshold }  : {}) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(digestSchedule  !== undefined ? { digestSchedule }  : {}) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(digestHourLocal !== undefined ? { digestHourLocal } : {}) as any,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                ...(digestDayOfWeek !== undefined ? { digestDayOfWeek } : {}) as any,
            },
            include: { _count: { select: { ingredients: true } } },
        });
        return NextResponse.json(area);
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Record to update not found")) {
            return NextResponse.json({ error: "Storage area not found" }, { status: 404 });
        }
        if (msg.includes("Unique constraint") || msg.includes("unique")) {
            return NextResponse.json({ error: "A storage area with this name already exists" }, { status: 409 });
        }
        throw e;
    }
}

// DELETE /api/storage-areas/[id] — delete (admin only, blocked if has ingredients)
export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const area = await prisma.storageArea.findFirst({
        where: { id, branchId },
        include: { _count: { select: { ingredients: true } } },
    });

    if (!area) return NextResponse.json({ error: "Storage area not found" }, { status: 404 });

    if (area._count.ingredients > 0) {
        return NextResponse.json(
            { error: `Cannot delete — ${area._count.ingredients} ingredient(s) are assigned to this area. Reassign them first.` },
            { status: 409 }
        );
    }

    await prisma.storageArea.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
