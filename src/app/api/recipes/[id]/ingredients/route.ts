import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// GET /api/recipes/[id]/ingredients
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const items = await prisma.recipeIngredient.findMany({
            where: { recipeId: id },
            include: { ingredient: true },
        });
        return NextResponse.json(items);
    } catch {
        return NextResponse.json({ error: "Failed to fetch recipe ingredients" }, { status: 500 });
    }
}

// PUT /api/recipes/[id]/ingredients  — replaces the full ingredient list
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const { id } = await params;
        const body: { ingredientId: string; quantity: number }[] = await request.json();

        // Delete all existing, then re-insert (atomic)
        await prisma.$transaction([
            prisma.recipeIngredient.deleteMany({ where: { recipeId: id } }),
            prisma.recipeIngredient.createMany({
                data: body.map((ri) => ({
                    recipeId: id,
                    ingredientId: ri.ingredientId,
                    quantity: ri.quantity,
                })),
            }),
        ]);

        const updated = await prisma.recipeIngredient.findMany({
            where: { recipeId: id },
            include: { ingredient: true },
        });
        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: "Failed to update recipe ingredients" }, { status: 500 });
    }
}
