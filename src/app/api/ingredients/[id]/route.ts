import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { branchId } = ctx;

        const { id } = await params;
        const ingredient = await prisma.ingredient.findFirst({
            where: { id, branchId },
            include: {
                supplier:           { select: { id: true, name: true } },
                category:           true,
                storageArea:        true,
                ingredientSuppliers: {
                    include: { supplier: { select: { id: true, name: true } } },
                    orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
                },
            },
        });
        if (!ingredient) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(ingredient);
    } catch {
        return NextResponse.json({ error: "Failed to fetch ingredient" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;

        const { id } = await params;

        const old = await prisma.ingredient.findFirst({ where: { id, branchId } });
        if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Category-level edit permission check (skip for admin/manager)
        if (!["admin", "manager"].includes(session.role)) {
            if (old.categoryId) {
                const perm = await prisma.userCategoryPermission.findUnique({
                    where: { userId_categoryId: { userId: session.userId, categoryId: old.categoryId } },
                });
                if (!perm || !perm.canEdit) {
                    return NextResponse.json({ error: "Forbidden: no edit permission for this category" }, { status: 403 });
                }
            }
        }

        const body = await request.json();
        const ingredient = await prisma.ingredient.update({
            where: { id },
            data: {
                name:           body.name,
                ...(body.sku !== undefined ? { sku: body.sku?.trim() || null } : {}),
                supplierId:     body.supplierId,
                purchaseUnit:   body.purchaseUnit,
                purchasePrice:  body.purchasePrice,
                recipeUnit:     body.recipeUnit,
                yieldPercent:   body.yieldPercent,
                conversionRate: body.conversionRate,
                groupId:        body.groupId,
                categoryId:     body.categoryId ?? null,
                storageAreaId:  body.storageAreaId !== undefined ? (body.storageAreaId || null) : undefined,
                imageUrl:       body.imageUrl ?? null,
            },
            include: {
                supplier:           { select: { id: true, name: true } },
                category:           true,
                storageArea:        true,
                ingredientSuppliers: {
                    include: { supplier: { select: { id: true, name: true } } },
                    orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
                },
            },
        });
        logAudit({
            session, action: "UPDATE", targetTable: "Ingredient",
            targetId: id, targetName: ingredient.name,
            oldValues: { name: old?.name, purchasePrice: old?.purchasePrice, categoryId: old?.categoryId, storageAreaId: old?.storageAreaId },
            newValues: { name: ingredient.name, purchasePrice: ingredient.purchasePrice, categoryId: ingredient.categoryId, storageAreaId: ingredient.storageAreaId, sku: ingredient.sku },
            branchId,
            request,
        });
        return NextResponse.json(ingredient);
    } catch {
        return NextResponse.json({ error: "Failed to update ingredient" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;

        const { id } = await params;

        const old = await prisma.ingredient.findFirst({ where: { id, branchId } });
        if (!old) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Category-level edit permission check (skip for admin/manager)
        if (!["admin", "manager"].includes(session.role)) {
            if (old.categoryId) {
                const perm = await prisma.userCategoryPermission.findUnique({
                    where: { userId_categoryId: { userId: session.userId, categoryId: old.categoryId } },
                });
                if (!perm || !perm.canEdit) {
                    return NextResponse.json({ error: "Forbidden: no edit permission for this category" }, { status: 403 });
                }
            }
        }

        await prisma.ingredient.delete({ where: { id } });
        logAudit({
            session, action: "DELETE", targetTable: "Ingredient",
            targetId: id, targetName: old?.name,
            oldValues: { name: old?.name, supplierId: old?.supplierId, categoryId: old?.categoryId },
            branchId,
            request,
        });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete ingredient" }, { status: 500 });
    }
}
