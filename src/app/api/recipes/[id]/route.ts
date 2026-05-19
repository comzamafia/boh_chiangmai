import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { syncSubRecipe } from "@/lib/sync-sub-recipe";
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
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;
        const body = await request.json();
        const old = await prisma.recipe.findUnique({ where: { id } });
        const recipe = await prisma.recipe.update({
            where: { id },
            data: {
                name:               body.name,
                category:           body.category,
                yieldAmount:        body.yieldAmount,
                yieldUnit:          body.yieldUnit,
                prepTime:           body.prepTime,
                cookTime:           body.cookTime,
                laborCostPerHour:   body.laborCostPerHour,
                energyCostPerBatch: body.energyCostPerBatch,
                sellingPrice:       body.sellingPrice ?? null,
                deliveryPrice:      body.deliveryPrice ?? null,
                imageUrl:           body.imageUrl,
                isMainSauce:        body.isMainSauce,
                isSubRecipe:        body.isSubRecipe ?? false,
                instructions:       body.instructions,
            },
            include: { ingredients: { include: { ingredient: true } } },
        });
        logAudit({
            session, action: "UPDATE", targetTable: "Recipe",
            targetId: id, targetName: recipe.name,
            oldValues: { name: old?.name, category: old?.category, sellingPrice: old?.sellingPrice },
            newValues: { name: recipe.name, category: recipe.category, sellingPrice: recipe.sellingPrice, isSubRecipe: recipe.isSubRecipe },
            request,
        });
        // Keep the linked Ingredient in sync whenever recipe name / costs / yield change
        if (recipe.isSubRecipe) syncSubRecipe(id);
        return NextResponse.json(recipe);
    } catch {
        return NextResponse.json({ error: "Failed to update recipe" }, { status: 500 });
    }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;
        const old = await prisma.recipe.findUnique({ where: { id } });
        // Recipe ingredients are cascade-deleted via schema
        await prisma.recipe.delete({ where: { id } });
        logAudit({
            session, action: "DELETE", targetTable: "Recipe",
            targetId: id, targetName: old?.name,
            oldValues: { name: old?.name, category: old?.category },
            request,
        });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete recipe" }, { status: 500 });
    }
}
