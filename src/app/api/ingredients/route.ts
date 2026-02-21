import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const group = searchParams.get("group");

        const ingredients = await prisma.ingredient.findMany({
            where: group ? { groupId: group } : undefined,
            include: { supplier: { select: { id: true, name: true } } },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(ingredients);
    } catch {
        return NextResponse.json({ error: "Failed to fetch ingredients" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const ingredient = await prisma.ingredient.create({
            data: {
                name: body.name,
                supplierId: body.supplierId,
                purchaseUnit: body.purchaseUnit,
                purchasePrice: body.purchasePrice,
                recipeUnit: body.recipeUnit,
                yieldPercent: body.yieldPercent,
                conversionRate: body.conversionRate,
                groupId: body.groupId,
                imageUrl: body.imageUrl ?? null,
            },
            include: { supplier: { select: { id: true, name: true } } },
        });
        return NextResponse.json(ingredient, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create ingredient" }, { status: 500 });
    }
}
