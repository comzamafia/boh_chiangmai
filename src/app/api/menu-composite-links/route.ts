/**
 * GET  /api/menu-composite-links   — list links (menu item → composite it uses)
 * POST /api/menu-composite-links   — create  { itemName, compositeId, qty, unit, notes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { composite: { select: { id: true, name: true, yieldQty: true, yieldUnit: true } } };

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.menuCompositeLink.findMany({ include: INCLUDE, orderBy: [{ itemName: "asc" }] });
    return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const b = await req.json();
    const itemName = String(b.itemName ?? "").trim();
    const compositeId = String(b.compositeId ?? "").trim();
    const qty = Number(b.qty);
    const unit = String(b.unit ?? "").trim();
    if (!itemName || !compositeId || !(qty > 0) || !unit) {
        return NextResponse.json({ error: "itemName, compositeId, qty (>0) and unit are required" }, { status: 400 });
    }
    const row = await db.menuCompositeLink.create({
        data: { itemName, compositeId, qty, unit, notes: b.notes?.trim() || null },
        include: INCLUDE,
    });
    return NextResponse.json(row, { status: 201 });
}
