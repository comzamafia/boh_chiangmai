/**
 * PUT    /api/prep-tasks/[id]   — toggle done / edit fields
 *   Body: { done? , name?, qty?, dueTime?, station? }
 *   Any logged-in user may toggle `done` (stamps doneBy/doneAt).
 *   Editing other fields requires admin/manager/chef.
 * DELETE /api/prep-tasks/[id]   — remove a task (admin/manager/chef)
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;

    const { id } = await params;

    const existing = await prisma.prepTask.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};

    // Anyone may tick/untick
    if (body.done !== undefined) {
        data.done   = !!body.done;
        data.doneBy = body.done ? (session.name ?? null) : null;
        data.doneAt = body.done ? new Date() : null;
    }

    // Field edits restricted to kitchen roles
    const wantsEdit = ["name", "qty", "dueTime", "station"].some(k => body[k] !== undefined);
    if (wantsEdit) {
        if (!EDIT_ROLES.includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        if (body.name    !== undefined) data.name    = String(body.name).trim();
        if (body.qty     !== undefined) data.qty     = body.qty?.trim()     || null;
        if (body.dueTime !== undefined) data.dueTime = body.dueTime?.trim() || null;
        if (body.station !== undefined) data.station = body.station;
    }

    const task = await prisma.prepTask.update({ where: { id }, data });
    return NextResponse.json(task);
}

export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;

    const existing = await prisma.prepTask.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await prisma.prepTask.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
