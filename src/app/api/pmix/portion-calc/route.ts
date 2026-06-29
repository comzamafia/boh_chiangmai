/**
 * GET /api/pmix/portion-calc?uploadId=X
 *
 * Calculates ingredient consumption from a PMIX upload using Portion Standards
 * (no BOM linkage required). For each PMIX item and modifier, matches against
 * the portion_standards table and sums: qty_sold × portion_size.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // 1. Load upload header
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upload = await (prisma as any).pmixUpload.findFirst({
        where: { id: uploadId, branchId },
        select: { id: true, periodLabel: true, uploadedAt: true },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 2. Load all PMIX items with modifiers for this upload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pmixItems: any[] = await (prisma as any).pmixItem.findMany({
        where: { uploadId, branchId },
        include: { modifiers: true },
    });

    // 3. Load all portion standards with ingredient + category
    const standards = await prisma.portionStandard.findMany({
        where: { branchId },
        include: {
            ingredient: {
                select: {
                    id: true, name: true, sku: true, recipeUnit: true, groupId: true,
                    categoryId: true,
                    category: { select: { id: true, name: true, sortOrder: true } },
                    inventoryItem: { select: { currentStock: true, parMin: true } },
                },
            },
        },
    });

    if (standards.length === 0) {
        return NextResponse.json({
            uploadId, periodLabel: upload.periodLabel, uploadedAt: upload.uploadedAt,
            ingredients: [], coverage: { matched: 0, unmatched: [], totalItems: pmixItems.length },
            hasStandards: false,
        });
    }

    // 4. Build lookup maps: lowercase name → list of standards
    //    Base standards: match against PmixItem.itemName
    //    Modifier standards: match against PmixModifier.modifier
    const baseMap   = new Map<string, typeof standards>();
    const modMap    = new Map<string, typeof standards>();

    for (const std of standards) {
        const key = std.itemName.toLowerCase().trim();
        if (std.type === "modifier") {
            if (!modMap.has(key))  modMap.set(key, []);
            modMap.get(key)!.push(std);
        } else {
            if (!baseMap.has(key)) baseMap.set(key, []);
            baseMap.get(key)!.push(std);
        }
    }

    // 5. Accumulate consumption
    // Map: ingredientId → { meta, totalQty, contributions[] }
    interface Contribution {
        source:      string;  // menu item name or modifier name
        sourceType:  "base" | "modifier";
        qtySold:     number;
        portionSize: number;
        portionUnit: string;
        totalQty:    number;
    }
    interface IngEntry {
        ingredientId:   string;
        ingredientName: string;
        sku:            string | null;
        unit:           string;          // portionUnit (may differ from recipeUnit)
        groupId:        string;
        categoryId:     string | null;
        categoryName:   string;
        categorySortOrder: number;
        currentStock:   number | null;
        parMin:         number | null;
        totalQty:       number;
        contributions:  Contribution[];
    }
    const ingMap = new Map<string, IngEntry>();

    const matchedItemNames = new Set<string>();
    const unmatchedItems   = new Set<string>();

    function addContribution(std: (typeof standards)[0], source: string, sourceType: "base" | "modifier", qtySold: number) {
        const totalQty = Number(std.portionSize) * qtySold;
        const key = std.ingredientId;
        if (!ingMap.has(key)) {
            ingMap.set(key, {
                ingredientId:      std.ingredientId,
                ingredientName:    std.ingredient.name,
                sku:               std.ingredient.sku,
                unit:              std.portionUnit,
                groupId:           std.ingredient.groupId,
                categoryId:        std.ingredient.categoryId,
                categoryName:      std.ingredient.category?.name ?? "Uncategorized",
                categorySortOrder: std.ingredient.category?.sortOrder ?? 999,
                currentStock:      std.ingredient.inventoryItem
                    ? Number(std.ingredient.inventoryItem.currentStock)
                    : null,
                parMin:            std.ingredient.inventoryItem
                    ? Number(std.ingredient.inventoryItem.parMin)
                    : null,
                totalQty:          0,
                contributions:     [],
            });
        }
        const entry = ingMap.get(key)!;
        entry.totalQty += totalQty;

        // Merge contribution (accumulate if same source)
        const existing = entry.contributions.find(c => c.source === source && c.portionUnit === std.portionUnit);
        if (existing) {
            existing.qtySold  += qtySold;
            existing.totalQty += totalQty;
        } else {
            entry.contributions.push({ source, sourceType, qtySold, portionSize: Number(std.portionSize), portionUnit: std.portionUnit, totalQty });
        }
    }

    for (const item of pmixItems) {
        const baseKey = item.itemName.toLowerCase().trim();
        const baseStds = baseMap.get(baseKey) ?? [];

        if (baseStds.length > 0) {
            matchedItemNames.add(item.itemName);
            for (const std of baseStds) {
                addContribution(std, item.itemName, "base", item.qtySold);
            }
        } else {
            unmatchedItems.add(item.itemName);
        }

        // Check modifiers
        for (const mod of item.modifiers) {
            const modKey = mod.modifier.toLowerCase().trim();
            const modStds = modMap.get(modKey) ?? [];
            for (const std of modStds) {
                matchedItemNames.add(mod.modifier);
                addContribution(std, mod.modifier, "modifier", mod.qtySold);
            }
        }
    }

    // 6. Build ingredients list sorted by category then totalQty
    const ingredients = [...ingMap.values()]
        .map(e => ({
            ...e,
            totalQty: Math.round(e.totalQty * 1000) / 1000,
            contributions: e.contributions
                .sort((a, b) => b.totalQty - a.totalQty)
                .map(c => ({ ...c, totalQty: Math.round(c.totalQty * 1000) / 1000 })),
        }))
        .sort((a, b) => {
            if (a.categorySortOrder !== b.categorySortOrder)
                return a.categorySortOrder - b.categorySortOrder;
            return b.totalQty - a.totalQty;
        });

    // Group by category
    const categoryMap: Record<string, {
        categoryId:   string | null;
        categoryName: string;
        sortOrder:    number;
        ingredients:  typeof ingredients;
    }> = {};

    for (const ing of ingredients) {
        const key = ing.categoryId ?? "__none__";
        if (!categoryMap[key]) {
            categoryMap[key] = {
                categoryId:   ing.categoryId,
                categoryName: ing.categoryName,
                sortOrder:    ing.categorySortOrder,
                ingredients:  [],
            };
        }
        categoryMap[key].ingredients.push(ing);
    }

    const categories = Object.values(categoryMap)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName));

    return NextResponse.json({
        uploadId,
        periodLabel:  upload.periodLabel,
        uploadedAt:   upload.uploadedAt,
        categories,
        ingredients,  // flat list for CSV export
        coverage: {
            matched:     matchedItemNames.size,
            unmatched:   [...unmatchedItems].sort(),
            totalItems:  pmixItems.length,
        },
        hasStandards: standards.length > 0,
        totalStandards: standards.length,
    });
}
