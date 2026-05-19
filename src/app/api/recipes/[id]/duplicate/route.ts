import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { NextResponse } from "next/server";

/**
 * POST /api/recipes/[id]/duplicate
 *
 * Creates an exact copy of the recipe (all fields + all ingredients/quantities).
 * The copy is named "Copy of <original name>" and opened in the editor immediately.
 * Returns the new recipe with ingredients included.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

        const { id } = await params;

        // Load source with all ingredient rows
        const source = await prisma.recipe.findUnique({
            where: { id },
            include: { ingredients: true },
        });
        if (!source) return NextResponse.json({ error: "Not found" }, { status: 404 });

        // Derive a unique "Copy of …" name (avoid collisions if user duplicates twice)
        const baseName = source.name.startsWith("Copy of ")
            ? source.name          // keep stacking naturally
            : `Copy of ${source.name}`;

        // Check for existing copies with the same base name and append a counter if needed
        const existing = await prisma.recipe.findMany({
            where: { name: { startsWith: baseName } },
            select: { name: true },
        });
        let copyName = baseName;
        if (existing.length > 0) {
            copyName = `${baseName} (${existing.length + 1})`;
        }

        const copy = await prisma.recipe.create({
            data: {
                name:               copyName,
                category:           source.category,
                yieldAmount:        source.yieldAmount,
                yieldUnit:          source.yieldUnit,
                prepTime:           source.prepTime,
                cookTime:           source.cookTime,
                laborCostPerHour:   source.laborCostPerHour,
                energyCostPerBatch: source.energyCostPerBatch,
                sellingPrice:       source.sellingPrice,
                deliveryPrice:      source.deliveryPrice,
                imageUrl:           source.imageUrl,
                isMainSauce:        source.isMainSauce,
                instructions:       source.instructions,
                ingredients: source.ingredients.length
                    ? {
                          create: source.ingredients.map(ri => ({
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
            targetId: copy.id, targetName: copy.name,
            newValues: { name: copy.name, category: copy.category, duplicatedFrom: source.name },
            request,
        });

        return NextResponse.json(copy, { status: 201 });
    } catch (e) {
        console.error("Duplicate recipe error:", e);
        return NextResponse.json({ error: "Failed to duplicate recipe" }, { status: 500 });
    }
}
