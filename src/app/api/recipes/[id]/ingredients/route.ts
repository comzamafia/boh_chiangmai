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
        if (!Array.isArray(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        // Deduplicate by ingredientId (last one wins) to avoid unique constraint violation
        const seen = new Map<string, number>();
        for (const ri of body) seen.set(ri.ingredientId, ri.quantity);
        // Delete all existing, then re-insert one-by-one
        // createMany has bugs with Prisma 7 + PrismaPg driver adapter (null constraint on defaults),
        // so we use individual create() calls which handle @default(cuid()) correctly.
        await (prisma as any).recipeIngredient.deleteMany({ where: { recipeId: id } });
        for (const [ingredientId, quantity] of seen.entries()) {
            await (prisma as any).recipeIngredient.create({
                data: { recipeId: id, ingredientId, quantity },
            });
        }

        const updated = await (prisma as any).recipeIngredient.findMany({
            where: { recipeId: id },
            include: { ingredient: true },
        });

        // Re-sync sub-recipe ingredient cost now that ingredient list changed
        const recipe = await (prisma as any).recipe.findUnique({
            where: { id },
            select: { isSubRecipe: true },
        });
        if (recipe?.isSubRecipe) syncSubRecipe(id);

        return NextResponse.json(updated);
    } catch (err) {
        console.error("[recipe ingredients PUT]", err);
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
