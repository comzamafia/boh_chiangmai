/**
 * PUT    /api/prep-stations/[id]   — rename / recolor / reorder
 *   Renaming also re-points existing PrepTask rows (station stored by name).
 * DELETE /api/prep-stations/[id]   — delete a station (blocked if it has tasks)
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();

    const current = await prisma.prepStation.findUnique({ where: { id } });
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.icon      !== undefined) data.icon      = body.icon;
    if (body.color     !== undefined) data.color     = body.color;
    if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder);

    const newName = body.name !== undefined ? String(body.name).trim() : undefined;
    if (newName && newName !== current.name) {
        data.name = newName;
        // Re-point every task that referenced the old station name
        await prisma.$transaction([
            prisma.prepStation.update({ where: { id }, data }),
            prisma.prepTask.updateMany({ where: { station: current.name }, data: { station: newName } }),
        ]);
        const updated = await prisma.prepStation.findUnique({ where: { id } });
        return NextResponse.json(updated);
    }

    const updated = await prisma.prepStation.update({ where: { id }, data });
    return NextResponse.json(updated);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const station = await prisma.prepStation.findUnique({ where: { id } });
    if (!station) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const taskCount = await prisma.prepTask.count({ where: { station: station.name } });
    if (taskCount > 0) {
        return NextResponse.json(
            { error: "has_tasks", taskCount, message: `Station has ${taskCount} task(s). Remove them first.` },
            { status: 409 },
        );
    }

    await prisma.prepStation.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
