import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { syncSubRecipe } from "@/lib/sync-sub-recipe";
import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

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
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { branchId } = ctx;

        const { id } = await params;
        const body: { ingredientId: string; quantity: number }[] = await request.json();
        if (!Array.isArray(body)) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

        // Deduplicate by ingredientId (last one wins) to avoid unique constraint violation.
        // Skip rows missing an ingredientId or a valid positive quantity.
        const seen = new Map<string, number>();
        for (const ri of body) {
            const ingId = String(ri.ingredientId ?? "").trim();
            const qty = Number(ri.quantity);
            if (!ingId || !Number.isFinite(qty) || qty <= 0) continue;
            seen.set(ingId, qty);
        }

        // Delete all existing, then re-insert one-by-one.
        // branchId MUST be set: the production recipe_ingredients table requires it
        // (multi-branch migration), and the other working createMany routes all pass it.
        // quantity is passed as a string and the id generated explicitly for safe
        // serialisation through the PrismaPg driver adapter.
        await (prisma as any).recipeIngredient.deleteMany({ where: { recipeId: id } });
        for (const [ingredientId, quantity] of seen.entries()) {
            await (prisma as any).recipeIngredient.create({
                data: { id: randomUUID(), recipeId: id, ingredientId, quantity: String(quantity), branchId },
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
