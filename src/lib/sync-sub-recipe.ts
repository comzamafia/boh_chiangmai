/**
 * syncSubRecipe
 *
 * When a recipe is flagged as a Sub Recipe, this function ensures an
 * Ingredient record exists that represents it, so it can be used as an
 * ingredient inside other recipes with fully correct costing.
 *
 * Mapping:
 *   Ingredient.name          ← Recipe.name
 *   Ingredient.purchasePrice ← totalCostPerYieldUnit (ingredients + labor + energy) in THB
 *   Ingredient.supplier      ← "Chiang Mai Sub Recipe" (auto-created if missing)
 *   Ingredient.purchaseUnit  ← Recipe.yieldUnit
 *   Ingredient.recipeUnit    ← Recipe.yieldUnit
 *   Ingredient.conversionRate← 1  (1 purchase unit = 1 recipe unit)
 *   Ingredient.yieldPercent  ← 100 (prepared product, no waste)
 *   Ingredient.groupId       ← derived from yieldUnit (Weight / Volume / Count)
 *   Ingredient.imageUrl      ← Recipe.imageUrl (if any)
 *
 * The recipe stores the linked Ingredient id in `linkedIngredientId` so
 * subsequent saves update the same row instead of creating duplicates.
 *
 * Fire-and-forget: wrap calls in try/catch — never let this throw.
 */

import { prisma } from "@/lib/db";

const SUPPLIER_NAME = "Chiang Mai Sub Recipe";

/** Convert a recipe yield unit to an Ingredient groupId */
function yieldUnitToGroup(unit: string): string {
    const u = unit.toLowerCase().trim();
    const WEIGHT  = ["kg", "g", "lb", "oz", "gram", "kilogram"];
    const VOLUME  = ["l", "ml", "liter", "litre", "fl oz", "cup", "tbsp", "tsp"];
    if (WEIGHT.includes(u))  return "Weight";
    if (VOLUME.includes(u))  return "Volume";
    return "Count"; // portion, serving, piece, batch, bowl, plate, etc.
}

export async function syncSubRecipe(recipeId: string): Promise<void> {
    try {
        // Load recipe with all its ingredient rows
        const recipe = await prisma.recipe.findUnique({
            where: { id: recipeId },
            include: {
                ingredients: { include: { ingredient: true } },
            },
        });
        if (!recipe || !recipe.isSubRecipe) return;

        // ── Total cost calculation ────────────────────────────────────────────
        const ingredientCost = recipe.ingredients.reduce((sum, ri) => {
            const i   = ri.ingredient;
            const price = Number(i.purchasePrice);
            const rate  = Number(i.conversionRate);
            const yld   = Number(i.yieldPercent);
            const qty   = Number(ri.quantity);
            if (!rate || !yld) return sum;
            return sum + (price / rate / (yld / 100)) * qty;
        }, 0);

        const laborCost  = Number(recipe.laborCostPerHour) *
                           ((recipe.prepTime + recipe.cookTime) / 60);
        const energyCost = Number(recipe.energyCostPerBatch);
        const totalCost  = ingredientCost + laborCost + energyCost;

        const yieldAmount      = Math.max(Number(recipe.yieldAmount), 0.0001);
        const costPerYieldUnit = totalCost / yieldAmount;  // THB per recipe unit

        // ── Ensure supplier exists ────────────────────────────────────────────
        let supplier = await prisma.supplier.findFirst({
            where: { name: SUPPLIER_NAME },
            select: { id: true },
        });
        if (!supplier) {
            supplier = await prisma.supplier.create({
                data: {
                    name:      SUPPLIER_NAME,
                    contact:   "System",
                    email:     "system@padthaichaiyo.local",
                    phone:     "-",
                    address:   "Chiang Mai",
                    status:    "Active",
                    isSpecial: true,
                },
                select: { id: true },
            });
        }

        const ingredientData = {
            name:           recipe.name,
            supplierId:     supplier.id,
            purchaseUnit:   recipe.yieldUnit,
            purchasePrice:  costPerYieldUnit,
            recipeUnit:     recipe.yieldUnit,
            yieldPercent:   100,
            conversionRate: 1,
            groupId:        yieldUnitToGroup(recipe.yieldUnit),
            imageUrl:       recipe.imageUrl ?? null,
        };

        // ── Create or update the linked Ingredient ───────────────────────────
        if (recipe.linkedIngredientId) {
            // Check the ingredient still exists (might have been manually deleted)
            const exists = await prisma.ingredient.findUnique({
                where: { id: recipe.linkedIngredientId },
                select: { id: true },
            });
            if (exists) {
                await prisma.ingredient.update({
                    where: { id: recipe.linkedIngredientId },
                    data:  ingredientData,
                });
                return;
            }
            // Ingredient was deleted externally — fall through to create a new one
        }

        // Create a fresh linked Ingredient and record its ID on the recipe
        const newIng = await prisma.ingredient.create({ data: ingredientData });
        await prisma.recipe.update({
            where: { id: recipeId },
            data:  { linkedIngredientId: newIng.id },
        });

    } catch (err) {
        // Never throw — sync failure must not break the recipe save
        console.error("[syncSubRecipe] failed for recipe", recipeId, err);
    }
}
