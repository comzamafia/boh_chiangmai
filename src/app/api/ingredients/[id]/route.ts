import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const ingredient = await prisma.ingredient.findUnique({
            where: { id },
            include: { supplier: { select: { id: true, name: true } } },
        });
        if (!ingredient) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(ingredient);
    } catch {
        return NextResponse.json({ error: "Failed to fetch ingredient" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const ingredient = await prisma.ingredient.update({
            where: { id },
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
        return NextResponse.json(ingredient);
    } catch {
        return NextResponse.json({ error: "Failed to update ingredient" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        await prisma.ingredient.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete ingredient" }, { status: 500 });
    }
}
