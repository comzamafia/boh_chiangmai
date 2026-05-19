import { prisma } from "@/lib/db";
import { syncSubRecipe } from "@/lib/sync-sub-recipe";
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

        // Re-sync sub-recipe ingredient cost now that ingredient list changed
        const recipe = await prisma.recipe.findUnique({
            where: { id },
            select: { isSubRecipe: true },
        });
        if (recipe?.isSubRecipe) syncSubRecipe(id);

        return NextResponse.json(updated);
    } catch {
        return NextResponse.json({ error: "Failed to update recipe ingredients" }, { status: 500 });
    }
}
