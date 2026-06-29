/**
 * PATCH  /api/report-stations/[id]  — rename / recolor { name?, icon?, color? }
 * DELETE /api/report-stations/[id]  — delete a station (cascades its menu assignments)
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const data: Record<string, unknown> = {};
    if (typeof body.name === "string"  && body.name.trim()) data.name  = body.name.trim();
    if (typeof body.icon === "string")  data.icon  = body.icon;
    if (typeof body.color === "string") data.color = body.color;
    if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

    const existing = await db.reportStation.findFirst({ where: { id, branchId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Station not found" }, { status: 404 });

    const station = await db.reportStation.update({ where: { id }, data });
    return NextResponse.json(station);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const existing = await db.reportStation.findFirst({ where: { id, branchId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Station not found" }, { status: 404 });

    await db.reportStation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
