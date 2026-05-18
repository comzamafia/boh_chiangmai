import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const ingredient = await prisma.ingredient.findUnique({
            where: { id },
            include: {
                supplier: { select: { id: true, name: true } },
                category: true,
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
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;

        // Category-level edit permission check (skip for admin/manager)
        if (!["admin", "manager"].includes(session.role)) {
            const existing = await prisma.ingredient.findUnique({ where: { id }, select: { categoryId: true } });
            if (existing?.categoryId) {
                const perm = await prisma.userCategoryPermission.findUnique({
                    where: { userId_categoryId: { userId: session.userId, categoryId: existing.categoryId } },
                });
                if (!perm || !perm.canEdit) {
                    return NextResponse.json({ error: "Forbidden: no edit permission for this category" }, { status: 403 });
                }
            }
        }

        const body = await request.json();
        const old = await prisma.ingredient.findUnique({ where: { id } });
        const ingredient = await prisma.ingredient.update({
            where: { id },
            data: {
                name:           body.name,
                supplierId:     body.supplierId,
                purchaseUnit:   body.purchaseUnit,
                purchasePrice:  body.purchasePrice,
                recipeUnit:     body.recipeUnit,
                yieldPercent:   body.yieldPercent,
                conversionRate: body.conversionRate,
                groupId:        body.groupId,
                categoryId:     body.categoryId ?? null,
                imageUrl:       body.imageUrl ?? null,
            },
            include: {
                supplier: { select: { id: true, name: true } },
                category: true,
            },
        });
        logAudit({
            session, action: "UPDATE", targetTable: "Ingredient",
            targetId: id, targetName: ingredient.name,
            oldValues: { name: old?.name, purchasePrice: old?.purchasePrice, categoryId: old?.categoryId },
            newValues: { name: ingredient.name, purchasePrice: ingredient.purchasePrice, categoryId: ingredient.categoryId },
            request,
        });
        return NextResponse.json(ingredient);
    } catch {
        return NextResponse.json({ error: "Failed to update ingredient" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;

        // Category-level edit permission check (skip for admin/manager)
        if (!["admin", "manager"].includes(session.role)) {
            const existing = await prisma.ingredient.findUnique({ where: { id }, select: { categoryId: true } });
            if (existing?.categoryId) {
                const perm = await prisma.userCategoryPermission.findUnique({
                    where: { userId_categoryId: { userId: session.userId, categoryId: existing.categoryId } },
                });
                if (!perm || !perm.canEdit) {
                    return NextResponse.json({ error: "Forbidden: no edit permission for this category" }, { status: 403 });
                }
            }
        }

        const old = await prisma.ingredient.findUnique({ where: { id } });
        await prisma.ingredient.delete({ where: { id } });
        logAudit({
            session, action: "DELETE", targetTable: "Ingredient",
            targetId: id, targetName: old?.name,
            oldValues: { name: old?.name, supplierId: old?.supplierId, categoryId: old?.categoryId },
            request,
        });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete ingredient" }, { status: 500 });
    }
}
