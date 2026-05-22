import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// PUT /api/storage-areas/[id] — update (admin only)
export async function PUT(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const { name, temperature, isActive, sortOrder } = await req.json();

    try {
        const area = await prisma.storageArea.update({
            where: { id },
            data: {
                ...(name !== undefined ? { name: name.trim() } : {}),
                ...(temperature !== undefined ? { temperature: temperature?.trim() || null } : {}),
                ...(isActive !== undefined ? { isActive } : {}),
                ...(sortOrder !== undefined ? { sortOrder } : {}),
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
    const session = await getSession();
    if (!session || session.role !== "admin") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;

    const area = await prisma.storageArea.findUnique({
        where: { id },
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
