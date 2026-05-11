import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            include: { ingredients: { include: { ingredient: true } } },
        });
        if (!recipe) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(recipe);
    } catch {
        return NextResponse.json({ error: "Failed to fetch recipe" }, { status: 500 });
    }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body = await request.json();
        const recipe = await prisma.recipe.update({
            where: { id },
            data: {
                name: body.name,
                category: body.category,
                yieldAmount: body.yieldAmount,
                yieldUnit: body.yieldUnit,
                prepTime: body.prepTime,
                cookTime: body.cookTime,
                laborCostPerHour: body.laborCostPerHour,
                energyCostPerBatch: body.energyCostPerBatch,
                sellingPrice: body.sellingPrice ?? null,
                imageUrl: body.imageUrl,
                isMainSauce: body.isMainSauce,
                instructions: body.instructions,
            },
            include: { ingredients: { include: { ingredient: true } } },
        });
        return NextResponse.json(recipe);
    } catch {
        return NextResponse.json({ error: "Failed to update recipe" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        // Recipe ingredients are cascade-deleted via schema
        await prisma.recipe.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete recipe" }, { status: 500 });
    }
}
