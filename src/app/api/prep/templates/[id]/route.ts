/** PUT/DELETE /api/prep/templates/[id] — edit / remove a backlog task. */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT = ["admin", "manager", "chef"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const body = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    if (body.name    !== undefined) data.name    = String(body.name).trim();
    if (body.qty     !== undefined) data.qty     = body.qty?.trim() || null;
    if (body.dueTime !== undefined) data.dueTime = body.dueTime?.trim() || null;
    if (body.active  !== undefined) data.active  = !!body.active;
    const tpl = await prisma.prepTaskTemplate.update({ where: { id }, data });
    return NextResponse.json(tpl);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await prisma.prepTaskTemplate.delete({ where: { id } });  // cascades board tasks
    return new NextResponse(null, { status: 204 });
}
