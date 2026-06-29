/**
 * GET /api/pmix/analytics?uploadId=X
 *
 * Returns all 4 strategic axes:
 *   axis1 — Menu Engineering (BCG Matrix)
 *   axis2 — Kitchen Prep & Station Forecast
 *   axis3 — Quality Control & Operational Loss
 *   axis4 — BOM Linkage & Ingredient Consumption
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// Station mapping by POS category
const CATEGORY_STATION: Record<string, string> = {
    "Appetizers":      "Grill / Appetizer",
    "Noodles":         "Wok",
    "Fried Rice":      "Wok",
    "Stir Fry":        "Wok",
    "Curry":           "Curry",
    "Soups & Salads":  "Expo",
    "Desserts":        "Dessert",
    "Sides":           "Expo",
    "Kids Meal":       "Wok",
    "Mocktails":       "Bar",
    "Cocktails":       "Bar",
    "Beverages":       "Bar",
    "Tea & Coffee":    "Bar",
    "Beer":            "Bar",
    "Shots & Spirits": "Bar",
    "Red Wine":        "Bar",
    "White Wine":      "Bar",
    "OPEN ITEM":       "Expo",
};

// Refund rate alert threshold
const REFUND_ALERT_PCT = 0.05; // 5%

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // Load items with modifiers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = await (prisma as any).pmixItem.findMany({
        where: { uploadId, branchId },
        include: { modifiers: true },
        orderBy: { qtySold: "desc" },
    });

    if (items.length === 0) {
        return NextResponse.json({ error: "No items found for this upload" }, { status: 404 });
    }

    // ─── AXIS 1: Menu Engineering (BCG Matrix) ──────────────────────────────
    // Popularity = qty sold vs average; Profitability = net sales per unit vs average
    const foodItems = items.filter(i =>
        !["Bar", "Dessert"].includes(CATEGORY_STATION[i.category] ?? "Other")
    );
    const allItems  = items; // include all for scatter

    const avgQty   = allItems.reduce((s: number, i: any) => s + i.qtySold, 0) / allItems.length;
    const avgPrice = allItems
        .filter((i: any) => i.qtySold > 0)
        .reduce((s: number, i: any) => s + Number(i.netSales) / i.qtySold, 0) /
        allItems.filter((i: any) => i.qtySold > 0).length;

    function classifyBCG(qty: number, unitPrice: number): "Star" | "Plowhorse" | "Puzzle" | "Dog" {
        const highPop  = qty >= avgQty;
        const highProf = unitPrice >= avgPrice;
        if (highPop && highProf)  return "Star";
        if (highPop && !highProf) return "Plowhorse";
        if (!highPop && highProf) return "Puzzle";
        return "Dog";
    }

    const axis1 = allItems.map((i: any) => {
        const unitPrice = i.qtySold > 0 ? Number(i.netSales) / i.qtySold : 0;
        const quadrant  = classifyBCG(i.qtySold, unitPrice);
        return {
            id: i.id, itemName: i.itemName, category: i.category,
            qtySold: i.qtySold, netSales: Number(i.netSales),
            unitPrice: Math.round(unitPrice * 100) / 100,
            quadrant,
            station: CATEGORY_STATION[i.category] ?? "Other",
        };
    });

    // Summary counts
    const bcgSummary = {
        Star:      axis1.filter((i: any) => i.quadrant === "Star").length,
        Plowhorse: axis1.filter((i: any) => i.quadrant === "Plowhorse").length,
        Puzzle:    axis1.filter((i: any) => i.quadrant === "Puzzle").length,
        Dog:       axis1.filter((i: any) => i.quadrant === "Dog").length,
        avgQty:    Math.round(avgQty * 10) / 10,
        avgPrice:  Math.round(avgPrice * 100) / 100,
    };

    // ─── AXIS 2: Kitchen Prep & Station Forecast ────────────────────────────
    // Aggregate by station → items within station → modifier breakdown
    const stationMap: Record<string, {
        totalQty: number;
        items: { name: string; qty: number; modifiers: { group: string; modifier: string; qty: number }[] }[];
    }> = {};

    for (const item of items) {
        const station = CATEGORY_STATION[item.category] ?? "Other";
        if (!stationMap[station]) stationMap[station] = { totalQty: 0, items: [] };
        stationMap[station].totalQty += item.qtySold;
        stationMap[station].items.push({
            name: item.itemName,
            qty:  item.qtySold,
            modifiers: item.modifiers.map((m: any) => ({
                group:    m.modifierGroup,
                modifier: m.modifier,
                qty:      m.qtySold,
            })),
        });
    }

    // Flatten to sorted array for chart
    const axis2 = Object.entries(stationMap)
        .map(([station, data]) => ({
            station,
            totalQty: data.totalQty,
            items: data.items.sort((a, b) => b.qty - a.qty).slice(0, 20),
        }))
        .sort((a, b) => b.totalQty - a.totalQty);

    // Top modifier prep list (most common choice modifiers)
    const modifierRollup: Record<string, { group: string; modifier: string; qty: number; items: string[] }> = {};
    for (const item of items) {
        for (const mod of item.modifiers) {
            const key = `${mod.modifierGroup}|||${mod.modifier}`;
            if (!modifierRollup[key]) {
                modifierRollup[key] = { group: mod.modifierGroup, modifier: mod.modifier, qty: 0, items: [] };
            }
            modifierRollup[key].qty += mod.qtySold;
            if (!modifierRollup[key].items.includes(item.itemName)) {
                modifierRollup[key].items.push(item.itemName);
            }
        }
    }
    const prepList = Object.values(modifierRollup)
        .filter(m => m.qty > 0)
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 30);

    // ─── AXIS 3: Quality Control & Operational Loss ─────────────────────────
    const axis3Items = items.map((i: any) => {
        const totalLoss = Number(i.refundAmount) + Math.abs(Number(i.discountAmount));
        const refundRate = i.qtySold > 0 ? i.refundQty / i.qtySold : 0;
        const alert = refundRate > REFUND_ALERT_PCT && i.qtySold >= 3;
        return {
            id: i.id, itemName: i.itemName, category: i.category,
            qtySold: i.qtySold,
            refundQty: i.refundQty, refundAmount: Number(i.refundAmount),
            discountAmount: Math.abs(Number(i.discountAmount)),
            totalLoss, refundRate: Math.round(refundRate * 1000) / 10, // as %
            alert,
        };
    }).sort((a: any, b: any) => b.totalLoss - a.totalLoss);

    const totalRefunds   = axis3Items.reduce((s: number, i: any) => s + i.refundAmount, 0);
    const totalDiscounts = axis3Items.reduce((s: number, i: any) => s + i.discountAmount, 0);
    const totalLoss      = totalRefunds + totalDiscounts;

    const donutData = [
        { name: "Refunds",   value: Math.round(totalRefunds * 100) / 100 },
        { name: "Discounts", value: Math.round(totalDiscounts * 100) / 100 },
    ];

    const alerts = axis3Items.filter((i: any) => i.alert);
    const top5Refunded = [...axis3Items]
        .filter((i: any) => i.refundQty > 0)
        .sort((a: any, b: any) => b.refundAmount - a.refundAmount)
        .slice(0, 5);

    // ─── AXIS 4: BOM Linkage & Ingredient Consumption ───────────────────────
    // For items with a linked recipeId, compute ingredient depletion
    const linkedItems = items.filter((i: any) => i.recipeId);

    // Fetch recipe ingredients for all linked recipes
    const recipeIds = [...new Set(linkedItems.map((i: any) => i.recipeId as string))];
    const recipeIngredients = recipeIds.length > 0
        ? await prisma.recipeIngredient.findMany({
            where: { recipeId: { in: recipeIds }, branchId },
            include: {
                ingredient: { select: { id: true, name: true, recipeUnit: true, groupId: true, category: { select: { name: true } } } },
                recipe: { select: { id: true, name: true, yieldAmount: true } },
            },
        })
        : [];

    // Aggregate ingredient consumption across all linked items
    const consumptionMap: Record<string, {
        ingredientId: string; ingredientName: string; unit: string;
        totalQty: number; groupId: string; category: string | null;
    }> = {};

    for (const item of linkedItems) {
        const riList = recipeIngredients.filter(ri => ri.recipeId === item.recipeId);
        const yield_ = Number(riList[0]?.recipe?.yieldAmount ?? 1);
        for (const ri of riList) {
            const perServing = Number(ri.quantity) / yield_;
            const totalUsed  = perServing * item.qtySold;
            const key = ri.ingredientId;
            if (!consumptionMap[key]) {
                consumptionMap[key] = {
                    ingredientId: ri.ingredientId,
                    ingredientName: ri.ingredient.name,
                    unit: ri.ingredient.recipeUnit,
                    totalQty: 0,
                    groupId: ri.ingredient.groupId,
                    category: ri.ingredient.category?.name ?? null,
                };
            }
            consumptionMap[key].totalQty += totalUsed;
        }
    }

    const axis4Consumption = Object.values(consumptionMap)
        .map(c => ({ ...c, totalQty: Math.round(c.totalQty * 1000) / 1000 }))
        .sort((a, b) => b.totalQty - a.totalQty);

    const axis4LinkedItems = linkedItems.map((i: any) => ({
        itemName: i.itemName, category: i.category,
        qtySold: i.qtySold, recipeId: i.recipeId,
    }));

    return NextResponse.json({
        uploadId,
        totalItems: items.length,
        totalQty:   items.reduce((s: number, i: any) => s + i.qtySold, 0),
        totalSales: Math.round(items.reduce((s: number, i: any) => s + Number(i.netSales), 0) * 100) / 100,

        axis1: { items: axis1, summary: bcgSummary },
        axis2: { stations: axis2, prepList },
        axis3: {
            items: axis3Items.slice(0, 50), donutData,
            totalRefunds:   Math.round(totalRefunds * 100) / 100,
            totalDiscounts: Math.round(totalDiscounts * 100) / 100,
            totalLoss:      Math.round(totalLoss * 100) / 100,
            alerts, top5Refunded,
        },
        axis4: {
            consumption:   axis4Consumption,
            linkedItems:   axis4LinkedItems,
            linkedCount:   linkedItems.length,
            unlinkedCount: items.length - linkedItems.length,
        },
    });
}
