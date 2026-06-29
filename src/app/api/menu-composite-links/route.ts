/**
 * GET  /api/menu-composite-links   — list links (menu item → composite it uses)
 * POST /api/menu-composite-links   — create  { itemName, compositeId, qty, unit, notes? }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { composite: { select: { id: true, name: true, yieldQty: true, yieldUnit: true } } };

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;
    const rows = await db.menuCompositeLink.findMany({ where: { branchId }, include: INCLUDE, orderBy: [{ itemName: "asc" }] });
    return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const b = await req.json();
    const itemName = String(b.itemName ?? "").trim();
    const compositeId = String(b.compositeId ?? "").trim();
    const qty = Number(b.qty);
    const unit = String(b.unit ?? "").trim();
    if (!itemName || !compositeId || !(qty > 0) || !unit) {
        return NextResponse.json({ error: "itemName, compositeId, qty (>0) and unit are required" }, { status: 400 });
    }
    // Ensure the referenced composite belongs to this branch
    const composite = await db.compositeRecipe.findFirst({ where: { id: compositeId, branchId } });
    if (!composite) return NextResponse.json({ error: "Composite not found" }, { status: 404 });
    const row = await db.menuCompositeLink.create({
        data: { itemName, compositeId, qty, unit, notes: b.notes?.trim() || null, branchId },
        include: INCLUDE,
    });
    return NextResponse.json(row, { status: 201 });
}
