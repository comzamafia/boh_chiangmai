/**
 * PUT /api/report-stations/report-unit  — persist an ingredient's preferred
 * display unit for the Station Prep Report.  body: { ingredientId, unit }
 * (unit = null/"" clears it, falling back to recipeUnit).
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PUT(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { ingredientId, unit } = await req.json();
    if (!ingredientId) return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });

    const owned = await db.ingredient.findFirst({ where: { id: ingredientId, branchId }, select: { id: true } });
    if (!owned) return NextResponse.json({ error: "Ingredient not found" }, { status: 404 });

    await db.ingredient.update({
        where: { id: ingredientId },
        data:  { reportUnit: unit?.trim() ? unit.trim() : null },
    });
    return NextResponse.json({ ok: true });
}
