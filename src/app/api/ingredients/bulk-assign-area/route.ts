/**
 * PUT /api/ingredients/bulk-assign-area
 * Assigns a storage area to multiple ingredients at once.
 * Body: { ingredientIds: string[], storageAreaId: string }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const EDIT = ["admin", "manager", "chef"];

export async function PUT(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ingredientIds, storageAreaId } = await req.json();
    if (!Array.isArray(ingredientIds) || !storageAreaId) {
        return NextResponse.json({ error: "ingredientIds[] and storageAreaId required" }, { status: 400 });
    }

    const result = await db.ingredient.updateMany({
        where: { id: { in: ingredientIds }, branchId },
        data: { storageAreaId },
    });

    return NextResponse.json({ ok: true, updated: result.count });
}
