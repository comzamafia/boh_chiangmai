/**
 * GET /api/pmix/daily-summary?uploadId=X
 *
 * CR 2.2 & 2.3 — Aggregated daily ingredient summary from a PMIX upload.
 * Explodes BOM for all linked items, groups results by ingredient category,
 * and includes drill-down showing which menu items drove each ingredient's usage.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // 1. Load upload header
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upload = await (prisma as any).pmixUpload.findUnique({ where: { id: uploadId } });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 2. Load all PMIX items for this upload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = await (prisma as any).pmixItem.findMany({
        where: { uploadId },
        orderBy: { qtySold: "desc" },
    });

    // 3. Find items linked to recipes
    const linkedItems = items.filter((i: any) => i.recipeId);
    const unlinkedCount = items.length - linkedItems.length;

    if (linkedItems.length === 0) {
        return NextResponse.json({
            uploadId,
            periodLabel: upload.periodLabel,
            uploadedAt: upload.uploadedAt,
            categories: [],
            linkedCount: 0,
            unlinkedCount: items.length,
            totalIngredients: 0,
        });
    }

    // 4. Load recipe-ingredient BOMs for all linked recipes
    const recipeIds = [...new Set(linkedItems.map((i: any) => i.recipeId as string))];
    const recipeIngredients = await prisma.recipeIngredient.findMany({
        where: { recipeId: { in: recipeIds } },
        include: {
            ingredient: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    recipeUnit: true,
                    groupId: true,
                    categoryId: true,
                    category: { select: { id: true, name: true, sortOrder: true } },
                },
            },
            recipe: { select: { id: true, yieldAmount: true } },
        },
    });

    // 5. Build consumption map with per-menu breakdown
    // Map: ingredientId → { meta, totalQty, menuBreakdown }
    const consumptionMap: Record<string, {
        ingredientId:   string;
        ingredientName: string;
        sku:            string | null;
        unit:           string;
        groupId:        string;
        categoryId:     string | null;
        categoryName:   string;
        categorySortOrder: number;
        totalQty:       number;
        menuBreakdown:  { menuName: string; qtySold: number; ingredientQty: number }[];
    }> = {};

    for (const item of linkedItems) {
        const riList = recipeIngredients.filter((ri: any) => ri.recipeId === item.recipeId);
        const yieldAmt = Number(riList[0]?.recipe?.yieldAmount ?? 1);

        for (const ri of riList) {
            const perServing = Number(ri.quantity) / yieldAmt;
            const totalUsed  = perServing * item.qtySold;
            const key = ri.ingredientId;

            if (!consumptionMap[key]) {
                consumptionMap[key] = {
                    ingredientId:      ri.ingredientId,
                    ingredientName:    ri.ingredient.name,
                    sku:               ri.ingredient.sku,
                    unit:              ri.ingredient.recipeUnit,
                    groupId:           ri.ingredient.groupId,
                    categoryId:        ri.ingredient.categoryId,
                    categoryName:      ri.ingredient.category?.name ?? "Uncategorized",
                    categorySortOrder: ri.ingredient.category?.sortOrder ?? 999,
                    totalQty:          0,
                    menuBreakdown:     [],
                };
            }

            consumptionMap[key].totalQty += totalUsed;

            // Add to menu breakdown
            const existing = consumptionMap[key].menuBreakdown.find(m => m.menuName === item.itemName);
            if (existing) {
                existing.ingredientQty += totalUsed;
                existing.qtySold += item.qtySold;
            } else {
                consumptionMap[key].menuBreakdown.push({
                    menuName:      item.itemName,
                    qtySold:       item.qtySold,
                    ingredientQty: totalUsed,
                });
            }
        }
    }

    // 6. Fetch current inventory stock for all consumed ingredients
    const ingredientIds = Object.keys(consumptionMap);
    const inventoryItems = await prisma.inventoryItem.findMany({
        where: { ingredientId: { in: ingredientIds } },
        select: { ingredientId: true, currentStock: true, parMin: true, parMax: true, reorderPoint: true, leadTimeDays: true, holdingDays: true },
    });
    const stockMap = new Map(inventoryItems.map(iv => [iv.ingredientId, iv]));

    // 7. Build final consumption entries, round values
    const entries = Object.values(consumptionMap).map(c => {
        const inv = stockMap.get(c.ingredientId);
        // Sort menu breakdown descending by qty, round to 3dp
        const breakdown = c.menuBreakdown
            .sort((a, b) => b.ingredientQty - a.ingredientQty)
            .map(m => ({
                menuName:      m.menuName,
                qtySold:       m.qtySold,
                ingredientQty: Math.round(m.ingredientQty * 1000) / 1000,
            }));
        const topMenu = breakdown[0] ?? null;

        return {
            ingredientId:      c.ingredientId,
            ingredientName:    c.ingredientName,
            sku:               c.sku,
            unit:              c.unit,
            groupId:           c.groupId,
            categoryId:        c.categoryId,
            categoryName:      c.categoryName,
            categorySortOrder: c.categorySortOrder,
            totalRequiredQty:  Math.round(c.totalQty * 1000) / 1000,
            topConsumingMenu:  topMenu ? { name: topMenu.menuName, qty: topMenu.ingredientQty } : null,
            currentStock:      inv ? Number(inv.currentStock) : null,
            parMin:            inv ? Number(inv.parMin) : null,
            parMax:            inv ? Number(inv.parMax) : null,
            reorderPoint:      inv ? Number(inv.reorderPoint) : null,
            leadTimeDays:      inv?.leadTimeDays ?? null,
            holdingDays:       inv?.holdingDays ?? null,
            menuBreakdown:     breakdown,
            isBelowPar:        inv ? Number(inv.currentStock) < Number(inv.parMin) : false,
        };
    });

    // 8. Group by category, sort category by sortOrder, then ingredient by totalQty desc
    const categoryMap: Record<string, {
        categoryId:   string | null;
        categoryName: string;
        sortOrder:    number;
        ingredients:  typeof entries;
    }> = {};

    for (const entry of entries) {
        const catKey = entry.categoryId ?? "__none__";
        if (!categoryMap[catKey]) {
            categoryMap[catKey] = {
                categoryId:   entry.categoryId,
                categoryName: entry.categoryName,
                sortOrder:    entry.categorySortOrder,
                ingredients:  [],
            };
        }
        categoryMap[catKey].ingredients.push(entry);
    }

    const categories = Object.values(categoryMap)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.categoryName.localeCompare(b.categoryName))
        .map(cat => ({
            ...cat,
            ingredients: cat.ingredients.sort((a, b) => b.totalRequiredQty - a.totalRequiredQty),
        }));

    return NextResponse.json({
        uploadId,
        periodLabel:      upload.periodLabel,
        uploadedAt:       upload.uploadedAt,
        categories,
        linkedCount:      linkedItems.length,
        unlinkedCount,
        totalIngredients: entries.length,
    });
}
