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
                supplier:           { select: { id: true, name: true } },
                category:           true,
                storageArea:        true,
                ingredientSuppliers: {
                    include: { supplier: { select: { id: true, name: true } } },
                    orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
                },
                inventoryItem:      { select: { currentStock: true, parMin: true } },
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

        // Auto-generate SKU if not provided
        let sku: string | null = body.sku?.trim() || null;
        if (!sku && body.name) {
            sku = await generateUniqueSku(body.name, body.groupId, body.categoryId);
        }

        const ingredient = await prisma.ingredient.create({
            data: {
                name:           body.name,
                sku,
                supplierId:     body.supplierId,
                purchaseUnit:   body.purchaseUnit,
                purchasePrice:  body.purchasePrice,
                recipeUnit:     body.recipeUnit,
                yieldPercent:   body.yieldPercent,
                conversionRate: body.conversionRate,
                groupId:        body.groupId,
                categoryId:     body.categoryId ?? null,
                storageAreaId:  body.storageAreaId ?? null,
                imageUrl:       body.imageUrl ?? null,
            },
            include: {
                supplier:           { select: { id: true, name: true } },
                category:           true,
                storageArea:        true,
                ingredientSuppliers: {
                    include: { supplier: { select: { id: true, name: true } } },
                },
            },
        });
        logAudit({
            session, action: "CREATE", targetTable: "Ingredient",
            targetId: ingredient.id, targetName: ingredient.name,
            newValues: {
                name: ingredient.name, sku, supplierId: ingredient.supplierId,
                categoryId: ingredient.categoryId, storageAreaId: ingredient.storageAreaId,
            },
            request,
        });
        return NextResponse.json(ingredient, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
    }
}

// ── SKU Auto-generation ────────────────────────────────────────────────────────
async function generateUniqueSku(name: string, groupId?: string, categoryId?: string): Promise<string> {
    // Derive category abbreviation if we have a categoryId
    let catAbbr = "GEN";
    if (categoryId) {
        const cat = await prisma.ingredientCategory.findUnique({ where: { id: categoryId }, select: { name: true } });
        if (cat) catAbbr = cat.name.slice(0, 3).toUpperCase().replace(/\s/g, "");
    }
    const grpMap: Record<string, string> = { Weight: "WGT", Volume: "VOL", Count: "CNT" };
    const grpAbbr = grpMap[groupId ?? ""] ?? "GEN";
    const nameAbbr = name.replace(/[aeiou\s]/gi, "").slice(0, 6).toUpperCase();
    const base = `${catAbbr}-${grpAbbr}-${nameAbbr}`;

    // Ensure uniqueness — append suffix if collision
    let candidate = base;
    let suffix = 2;
    while (await prisma.ingredient.findUnique({ where: { sku: candidate } })) {
        candidate = `${base}${suffix}`;
        suffix++;
    }
    return candidate;
}
