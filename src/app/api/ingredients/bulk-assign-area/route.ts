/**
 * PUT /api/ingredients/bulk-assign-area
 * Assigns a storage area to multiple ingredients at once.
 * Body: { ingredientIds: string[], storageAreaId: string }
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const EDIT = ["admin", "manager", "chef"];

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { ingredientIds, storageAreaId } = await req.json();
    if (!Array.isArray(ingredientIds) || !storageAreaId) {
        return NextResponse.json({ error: "ingredientIds[] and storageAreaId required" }, { status: 400 });
    }

    const result = await db.ingredient.updateMany({
        where: { id: { in: ingredientIds } },
        data: { storageAreaId },
    });

    return NextResponse.json({ ok: true, updated: result.count });
}
