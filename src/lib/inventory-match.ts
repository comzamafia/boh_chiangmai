/**
 * Server-side helpers for fuzzy-matching PMIX item / group names to
 * InventoryItem rows so heat-map APIs can attach Balance + Order columns.
 *
 * Used by dessert-heatmap, beverage-heatmap, curry-heatmap routes.
 */
import { prisma } from "@/lib/db";

export interface InvSnapshot {
    inventoryItemId: string;
    currentStock:    number;     // recipe units
    parMin:          number;     // recipe units
    recipeUnit:      string;
    purchaseUnit:    string;
    conversionRate:  number;
}

/** Load all tracked inventory items into a name→snapshot map. */
export async function loadInventoryByName(): Promise<Map<string, InvSnapshot>> {
    const items = await prisma.inventoryItem.findMany({
        select: {
            id:           true,
            currentStock: true,
            parMin:       true,
            ingredient: {
                select: {
                    name:           true,
                    recipeUnit:     true,
                    purchaseUnit:   true,
                    conversionRate: true,
                },
            },
        },
    });
    const map = new Map<string, InvSnapshot>();
    for (const iv of items) {
        const key = iv.ingredient.name.toLowerCase().trim();
        map.set(key, {
            inventoryItemId: iv.id,
            currentStock:    Number(iv.currentStock),
            parMin:          Number(iv.parMin),
            recipeUnit:      iv.ingredient.recipeUnit,
            purchaseUnit:    iv.ingredient.purchaseUnit ?? iv.ingredient.recipeUnit,
            conversionRate:  Number(iv.ingredient.conversionRate) || 1,
        });
    }
    return map;
}

/**
 * Word-boundary aware fuzzy match for an item / group name against the
 * inventory map. Priority: exact → prefix-with-separator → contains.
 * Returns null when nothing matches.
 */
export function fuzzyMatchInventory(
    itemName: string,
    invByName: Map<string, InvSnapshot>,
): InvSnapshot | null {
    const target = itemName.toLowerCase().trim();
    if (!target) return null;

    // 1. Exact
    const exact = invByName.get(target);
    if (exact) return exact;

    // 2. Word-boundary prefix in either direction
    for (const [ingName, snap] of invByName) {
        if (ingName.startsWith(target + " ") || ingName.startsWith(target + "-") ||
            target.startsWith(ingName + " ") || target.startsWith(ingName + "-")) {
            return snap;
        }
    }

    // 3. Contains (loosest)
    for (const [ingName, snap] of invByName) {
        if (ingName.includes(target) || target.includes(ingName)) return snap;
    }
    return null;
}

/**
 * Convert a recipe-unit qty into purchase-unit qty using snapshot's
 * conversionRate. Returns the original qty when purchaseUnit === recipeUnit.
 */
export function toDisplayQty(qty: number, snap: InvSnapshot): { qty: number; unit: string } {
    if (snap.purchaseUnit === snap.recipeUnit || snap.conversionRate <= 0) {
        return { qty, unit: snap.recipeUnit };
    }
    return { qty: qty / snap.conversionRate, unit: snap.purchaseUnit };
}
