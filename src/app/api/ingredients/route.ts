import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const session = await getSession();
        const { searchParams } = new URL(request.url);
        const group = searchParams.get("group");

        // Build where clause — start with group filter
        const where: Record<string, unknown> = {};
        if (group) where.groupId = group;

        // Row-level category filtering for non-admin/manager roles
        if (session && !["admin", "manager"].includes(session.role)) {
            const perms = await prisma.userCategoryPermission.findMany({
                where: { userId: session.userId },
                select: { categoryId: true },
            });
            if (perms.length > 0) {
                where.categoryId = { in: perms.map(p => p.categoryId) };
            }
        }

        const ingredients = await prisma.ingredient.findMany({
            where,
            include: {
                supplier: { select: { id: true, name: true } },
                category: true,
            },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(ingredients);
    } catch {
        return NextResponse.json({ error: "Failed to fetch ingredients" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        const body = await request.json();
        const ingredient = await prisma.ingredient.create({
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
            session, action: "CREATE", targetTable: "Ingredient",
            targetId: ingredient.id, targetName: ingredient.name,
            newValues: { name: ingredient.name, supplierId: ingredient.supplierId, categoryId: ingredient.categoryId },
            request,
        });
        return NextResponse.json(ingredient, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
    }
}
