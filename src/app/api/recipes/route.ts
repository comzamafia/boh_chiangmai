import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
    try {
        const { searchParams } = new URL(request.url);
        const category = searchParams.get("category");

        const recipes = await prisma.recipe.findMany({
            where: category ? { category } : undefined,
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
        const body = await request.json();
        const recipe = await prisma.recipe.create({
            data: {
                name: body.name,
                category: body.category,
                yieldAmount: body.yieldAmount,
                yieldUnit: body.yieldUnit,
                prepTime: body.prepTime,
                cookTime: body.cookTime,
                laborCostPerHour: body.laborCostPerHour ?? 50,
                energyCostPerBatch: body.energyCostPerBatch ?? 2,
                imageUrl: body.imageUrl,
                isMainSauce: body.isMainSauce ?? false,
                instructions: body.instructions,
                // Create nested ingredients in one transaction
                ingredients: body.ingredients?.length
                    ? {
                          create: body.ingredients.map((ri: { ingredientId: string; quantity: number }) => ({
                              ingredientId: ri.ingredientId,
                              quantity: ri.quantity,
                          })),
                      }
                    : undefined,
            },
            include: { ingredients: { include: { ingredient: true } } },
        });
        return NextResponse.json(recipe, { status: 201 });
    } catch {
        return NextResponse.json({ error: "Failed to create recipe" }, { status: 500 });
    }
}
