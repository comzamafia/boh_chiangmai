import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

// PUT /api/ingredient-categories/[id] — admin only
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await params;
        const body = await request.json();
        const old = await prisma.ingredientCategory.findFirst({ where: { id, branchId } });
        if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

        const updated = await prisma.ingredientCategory.update({
            where: { id },
            data: {
                name:        body.name?.trim()        ?? old.name,
                description: body.description?.trim() ?? old.description,
                sortOrder:   body.sortOrder != null   ? Number(body.sortOrder) : old.sortOrder,
            },
        });
        logAudit({ session, action: "UPDATE", targetTable: "IngredientCategory", targetId: id, targetName: updated.name, oldValues: { name: old.name, description: old.description }, newValues: { name: updated.name, description: updated.description }, branchId, request });
        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: "Failed to update category" }, { status: 500 });
    }
}

// DELETE /api/ingredient-categories/[id] — admin only
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (session.role !== "admin") {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const { id } = await params;
        const old = await prisma.ingredientCategory.findFirst({ where: { id, branchId } });
        if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });
        // Block delete if ingredients are linked
        const count = await prisma.ingredient.count({ where: { categoryId: id, branchId } });
        if (count > 0) {
            return NextResponse.json(
                { error: `Cannot delete: ${count} ingredient(s) are assigned to this category. Re-assign them first.` },
                { status: 409 }
            );
        }
        await prisma.ingredientCategory.delete({ where: { id } });
        logAudit({ session, action: "DELETE", targetTable: "IngredientCategory", targetId: id, targetName: old.name, branchId, request });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete category" }, { status: 500 });
    }
}
