import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// GET /api/ingredient-suppliers?ingredientId=X — list supplier links for an ingredient
export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const ingredientId = searchParams.get("ingredientId");
    if (!ingredientId) {
        return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });
    }

    const links = await prisma.ingredientSupplier.findMany({
        where: { ingredientId },
        include: { supplier: { select: { id: true, name: true } } },
        orderBy: [{ isPreferred: "desc" }, { createdAt: "asc" }],
    });

    return NextResponse.json(links);
}

// POST /api/ingredient-suppliers — create a supplier link (admin/manager)
export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const {
        ingredientId, supplierId,
        purchasePrice, purchaseUnit, conversionRate,
        isPreferred = false, notes,
    } = await req.json();

    if (!ingredientId || !supplierId || purchasePrice == null || !purchaseUnit || conversionRate == null) {
        return NextResponse.json(
            { error: "ingredientId, supplierId, purchasePrice, purchaseUnit and conversionRate are required" },
            { status: 400 }
        );
    }

    // If this one is preferred, unset any existing preferred for this ingredient
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await prisma.$transaction(async (tx: any) => {
        if (isPreferred) {
            await tx.ingredientSupplier.updateMany({
                where: { ingredientId, isPreferred: true },
                data: { isPreferred: false },
            });
        }
        return tx.ingredientSupplier.create({
            data: {
                ingredientId, supplierId,
                purchasePrice, purchaseUnit,
                conversionRate,
                isPreferred,
                notes: notes?.trim() || null,
            },
            include: { supplier: { select: { id: true, name: true } } },
        });
    });

    return NextResponse.json(result, { status: 201 });
}
