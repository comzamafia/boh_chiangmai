/**
 * GET /api/pmix/dashboard?uploadId=X
 *
 * Aggregates a single PMIX upload into the daily Product Mix Dashboard:
 *   - 4 macro KPI buckets: FOOD / LIQUOR / BEVERAGE / DESSERT (% + $)
 *   - Top items per POS category (up to 4 categories × 5 items)
 *   - Bar performance: Cocktails / Mocktails / Beer (top 5 each)
 *   - Dessert performance: top 5 desserts
 *   - Auto-generated key insights
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, type RuleRow } from "@/lib/pmix-classifier";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

// ─── Macro bucket helpers ────────────────────────────────────────────────────
const LIQUOR_CATS = new Set([
    "cocktails", "classic cocktails", "shots & spirits",
    "red wine", "white wine",
]);
const BEVERAGE_CATS = new Set([
    "beer", "mocktails", "soft drinks", "soda", "juice", "tea", "coffee", "water",
]);

type Bucket = "FOOD" | "LIQUOR" | "BEVERAGE" | "DESSERT";

function macroBucket(category: string, isDessert: boolean): Bucket {
    if (isDessert) return "DESSERT";
    const lower = category.toLowerCase().trim();
    if (LIQUOR_CATS.has(lower))   return "LIQUOR";
    if (BEVERAGE_CATS.has(lower)) return "BEVERAGE";
    // Beverage cats list from BEVERAGE_CATEGORIES — but split: alcoholic → liquor
    const bevSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));
    if (bevSet.has(lower) && !LIQUOR_CATS.has(lower)) return "BEVERAGE";
    return "FOOD";
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const upload = await db.pmixUpload.findUnique({
        where:  { id: uploadId },
        select: { id: true, periodLabel: true, businessDate: true, uploadedAt: true },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    const pmixItems: Array<{ itemName: string; category: string; qtySold: number; netSales: unknown }> =
        await db.pmixItem.findMany({
            where:   { uploadId },
            select:  { itemName: true, category: true, qtySold: true, netSales: true },
        });

    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // ── Classify + bucket ────────────────────────────────────────────────────
    interface ItemRow {
        itemName: string;
        category: string;
        qty:      number;
        sales:    number;
        bucket:   Bucket;
    }
    const rows: ItemRow[] = pmixItems.map(it => {
        const cat       = (it.category ?? "").trim();
        const cls       = classifyItem(it.itemName, rules);
        const isDessert = cls?.category === "dessert";
        return {
            itemName: it.itemName,
            category: cat || "Uncategorized",
            qty:      Number(it.qtySold),
            sales:    Number(it.netSales),
            bucket:   macroBucket(cat, isDessert),
        };
    }).filter(r => r.qty > 0 || r.sales > 0);

    // ── Macro bucket totals ──────────────────────────────────────────────────
    const macros: Record<Bucket, { sales: number; qty: number }> = {
        FOOD:     { sales: 0, qty: 0 },
        LIQUOR:   { sales: 0, qty: 0 },
        BEVERAGE: { sales: 0, qty: 0 },
        DESSERT:  { sales: 0, qty: 0 },
    };
    for (const r of rows) {
        macros[r.bucket].sales += r.sales;
        macros[r.bucket].qty   += r.qty;
    }
    const totalSales = macros.FOOD.sales + macros.LIQUOR.sales + macros.BEVERAGE.sales + macros.DESSERT.sales;
    const macroPct = (b: Bucket) => totalSales > 0 ? +((macros[b].sales / totalSales) * 100).toFixed(1) : 0;

    // ── Top items by FOOD category (group by category, top 4 cats, top 5 items each) ─
    const foodByCategory = new Map<string, ItemRow[]>();
    for (const r of rows) {
        if (r.bucket !== "FOOD") continue;
        if (!foodByCategory.has(r.category)) foodByCategory.set(r.category, []);
        foodByCategory.get(r.category)!.push(r);
    }
    // Sort categories by total qty desc, then take top 4 categories with items
    const sortedCats = [...foodByCategory.entries()]
        .map(([cat, items]) => ({
            category: cat,
            items:    items.sort((a, b) => b.qty - a.qty).slice(0, 5),
            totalQty: items.reduce((s, i) => s + i.qty, 0),
        }))
        .sort((a, b) => b.totalQty - a.totalQty)
        .slice(0, 4);

    const topByCategory = sortedCats.map(c => ({
        category: c.category,
        items:    c.items.map(r => ({ itemName: r.itemName, qty: r.qty })),
    }));

    // ── Bar performance (Cocktails / Mocktails / Beer) ───────────────────────
    function pickByCat(catNames: string[]): { itemName: string; qty: number }[] {
        const lowered = catNames.map(c => c.toLowerCase());
        return rows
            .filter(r => lowered.some(c => r.category.toLowerCase() === c))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5)
            .map(r => ({ itemName: r.itemName, qty: r.qty }));
    }
    const bar = {
        cocktails: pickByCat(["Cocktails", "Classic Cocktails"]),
        mocktails: pickByCat(["Mocktails", "Mocktail"]),
        beer:      pickByCat(["Beer"]),
    };

    // ── Dessert performance ──────────────────────────────────────────────────
    const desserts = rows
        .filter(r => r.bucket === "DESSERT")
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map(r => ({ itemName: r.itemName, qty: r.qty }));

    // ── Key insights (auto-generated) ────────────────────────────────────────
    const topItemsAll = [...rows].sort((a, b) => b.sales - a.sales).slice(0, 3);
    const top3Sales   = topItemsAll.reduce((s, r) => s + r.sales, 0);
    const top3Pct     = totalSales > 0 ? +((top3Sales / totalSales) * 100).toFixed(1) : 0;
    const topItem     = [...rows].sort((a, b) => b.qty - a.qty)[0];
    const topCocktail = bar.cocktails[0];
    const topDessert  = desserts[0];

    const insights: string[] = [
        `Food drives ${macroPct("FOOD")}% of total sales.`,
    ];
    if (topItemsAll.length === 3) {
        insights.push(`Top 3 items (${topItemsAll.map(r => r.itemName).join(", ")}) generated ${top3Pct}% of total sales.`);
    }
    if (topItem) insights.push(`${topItem.itemName} is the #1 item by sales and quantity.`);
    if (topCocktail) insights.push(`${topCocktail.itemName} is the top cocktail.`);
    if (topDessert) insights.push(`${topDessert.itemName} leads dessert sales.`);

    // ── Management focus (simple rules-based suggestions) ────────────────────
    const focus: { title: string; emoji: string; body: string }[] = [];

    if (topItemsAll.length > 0) {
        focus.push({
            emoji: "⭐",
            title: "Top Performers",
            body:  `${topItemsAll.map(r => r.itemName).join(", ")} ${topItemsAll.length > 1 ? "are" : "is"} the biggest revenue driver${topItemsAll.length > 1 ? "s" : ""}.`,
        });
    }
    if (macroPct("LIQUOR") < 15) {
        focus.push({
            emoji: "🍸",
            title: "Bar Opportunity",
            body:  `Liquor mix is ${macroPct("LIQUOR")}%. Increase cocktail attachments and premium spirit sales.`,
        });
    }
    if (topDessert) {
        focus.push({
            emoji: "🍰",
            title: "Dessert Opportunity",
            body:  `Continue promoting ${topDessert.itemName}${desserts[1] ? ` and ${desserts[1].itemName}` : ""}.`,
        });
    }
    if (bar.beer[0]) {
        focus.push({
            emoji: "🍺",
            title: "Beer Focus",
            body:  `Push ${bar.beer[0].itemName}${bar.beer[1] ? ` and ${bar.beer[1].itemName}` : ""} during peak hours.`,
        });
    }
    focus.push({
        emoji: "📈",
        title: "Growth Opportunity",
        body:  "Focus on combo upsells, add-ons, and high-margin items.",
    });

    // ── Response ─────────────────────────────────────────────────────────────
    return NextResponse.json({
        uploadId,
        periodLabel:  upload.periodLabel,
        businessDate: (upload.businessDate ?? upload.uploadedAt) as Date,
        totalSales:   +totalSales.toFixed(2),
        totalQty:     rows.reduce((s, r) => s + r.qty, 0),

        macros: {
            FOOD:     { sales: +macros.FOOD.sales.toFixed(2),     qty: macros.FOOD.qty,     pct: macroPct("FOOD") },
            LIQUOR:   { sales: +macros.LIQUOR.sales.toFixed(2),   qty: macros.LIQUOR.qty,   pct: macroPct("LIQUOR") },
            BEVERAGE: { sales: +macros.BEVERAGE.sales.toFixed(2), qty: macros.BEVERAGE.qty, pct: macroPct("BEVERAGE") },
            DESSERT:  { sales: +macros.DESSERT.sales.toFixed(2),  qty: macros.DESSERT.qty,  pct: macroPct("DESSERT") },
        },

        topByCategory,
        bar,
        desserts,
        insights,
        focus,
    });
}
