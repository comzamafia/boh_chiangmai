import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";
import { syncSubRecipe } from "@/lib/sync-sub-recipe";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category");

        // ── Branch scoping ─────────────────────────────────────────────────
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;

        // ── Row-level recipe category filtering ────────────────────────────
        // Admin & Manager always see all. Other roles are restricted to their
        // assigned recipe categories (if any are configured; none = see all).
        let allowedCategories: string[] | null = null;

        if (session && !["admin", "manager"].includes(session.role)) {
            const perms = await prisma.userRecipeCategoryPermission.findMany({
                where: { userId: session.userId, branchId },
                include: { category: { select: { name: true } } },
            });
            if (perms.length > 0) {
                allowedCategories = perms.map(p => p.category.name);
            }
        }

        const where: { branchId: string; category?: string | { in: string[] } } = { branchId };
        if (category) {
            // Explicit filter from query param — respect category restriction too
            where.category = allowedCategories
                ? (allowedCategories.includes(category) ? category : "__no_match__")
                : category;
        } else if (allowedCategories) {
            where.category = { in: allowedCategories };
        }

        const recipes = await prisma.recipe.findMany({
            where,
            include: {
                ingredients: {
                    include: { ingredient: true },
                },
            },
            orderBy: { name: "asc" },
        });
        return NextResponse.json(recipes);
    } catch {
        return NextResponse.json({ error: "Failed to fetch recipes" }, { status: 500 });
    }
}

export async function POST(request: Request) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;

        const body = await request.json();
        const recipe = await prisma.recipe.create({
            data: {
                branchId,
                name:               body.name,
                category:           body.category,
                yieldAmount:        body.yieldAmount,
                yieldUnit:          body.yieldUnit,
                prepTime:           body.prepTime,
                cookTime:           body.cookTime,
                laborCostPerHour:   body.laborCostPerHour ?? 50,
                energyCostPerBatch: body.energyCostPerBatch ?? 2,
                sellingPrice:       body.sellingPrice ?? null,
                deliveryPrice:      body.deliveryPrice ?? null,
                imageUrl:           body.imageUrl,
                isMainSauce:        body.isMainSauce ?? false,
                isSubRecipe:        body.isSubRecipe ?? false,
                instructions:       body.instructions,
                ingredients: body.ingredients?.length
                    ? {
                          create: body.ingredients.map((ri: { ingredientId: string; quantity: number }) => ({
                              ingredientId: ri.ingredientId,
                              quantity:     ri.quantity,
                          })),
                      }
                    : undefined,
            },
            include: { ingredients: { include: { ingredient: true } } },
        });
        logAudit({
            session, action: "CREATE", targetTable: "Recipe",
            targetId: recipe.id, targetName: recipe.name,
            newValues: { name: recipe.name, category: recipe.category, isSubRecipe: recipe.isSubRecipe },
            branchId, request,
        });
        // If flagged as Sub Recipe, auto-create the linked Ingredient (fire-and-forget)
        if (recipe.isSubRecipe) syncSubRecipe(recipe.id);
        return NextResponse.json(recipe, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create recipe" }, { status: 500 });
    }
}
