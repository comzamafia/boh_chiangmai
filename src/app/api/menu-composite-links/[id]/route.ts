/**
 * PATCH  /api/menu-composite-links/[id]  — update a link
 * DELETE /api/menu-composite-links/[id]  — delete a link
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { composite: { select: { id: true, name: true, yieldQty: true, yieldUnit: true } } };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const b = await req.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (b.itemName != null)    data.itemName = String(b.itemName).trim();
    if (b.compositeId != null) data.compositeId = String(b.compositeId).trim();
    if (b.qty != null)         data.qty = Number(b.qty);
    if (b.unit != null)        data.unit = String(b.unit).trim();
    if (b.notes !== undefined) data.notes = b.notes?.trim() || null;
    const row = await db.menuCompositeLink.update({ where: { id }, data, include: INCLUDE });
    return NextResponse.json(row);
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    await db.menuCompositeLink.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
