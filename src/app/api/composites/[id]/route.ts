/**
 * PATCH  /api/composites/[id]  — update a composite (replaces components if given)
 * DELETE /api/composites/[id]  — delete a composite (and its menu links, via cascade)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { components: { include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } } } };

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const b = await req.json();

    const existing = await db.compositeRecipe.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if (b.name != null)      data.name = String(b.name).trim();
    if (b.yieldQty != null)  data.yieldQty = Number(b.yieldQty);
    if (b.yieldUnit != null) data.yieldUnit = String(b.yieldUnit).trim();
    if (b.notes !== undefined) data.notes = b.notes?.trim() || null;

    try {
        if (Array.isArray(b.components)) {
            const components = b.components
                .map((c: { ingredientId?: unknown; qty?: unknown; unit?: unknown }) => ({
                    ingredientId: String(c.ingredientId ?? "").trim(), qty: Number(c.qty), unit: String(c.unit ?? "").trim(),
                }))
                .filter((c: { ingredientId: string; qty: number; unit: string }) => c.ingredientId && c.qty > 0 && c.unit);
            await db.compositeComponent.deleteMany({ where: { compositeId: id, branchId } });
            data.components = { create: components.map((c: { ingredientId: string; qty: number; unit: string }) => ({ ...c, branchId })) };
        }
        const row = await db.compositeRecipe.update({ where: { id }, data, include: INCLUDE });
        return NextResponse.json(row);
    } catch {
        return NextResponse.json({ error: "Failed to update composite" }, { status: 400 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const existing = await db.compositeRecipe.findFirst({ where: { id, branchId } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
    await db.compositeRecipe.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
