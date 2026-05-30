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
// Exact POS-category names that are alcoholic spirits / wine.
const LIQUOR_CATS = new Set([
    "cocktails", "classic cocktails", "shots & spirits",
    "red wine", "white wine",
]);
// Substring patterns that mark an item as non-alcoholic beverage.
// Broad on purpose so "Beverages", "Iced Tea", "Soft Drinks", "Juices",
// "Bottled Water", etc. all land in the BEVERAGE bucket.
const BEVERAGE_PATTERNS = [
    "beverage", "soft drink", "soda", "juice", "tea", "coffee",
    "water", "non-alcoholic", "non alcoholic",
];

type Bucket = "FOOD" | "LIQUOR" | "BEVERAGE" | "DESSERT";

function macroBucket(category: string, isDessert: boolean): Bucket {
    if (isDessert) return "DESSERT";
    const lower = category.toLowerCase().trim();
    if (LIQUOR_CATS.has(lower)) return "LIQUOR";
    // Beer + Mocktails are explicit
    if (lower === "beer" || lower === "mocktails" || lower === "mocktail") return "BEVERAGE";
    // Anything else matching a beverage pattern
    if (BEVERAGE_PATTERNS.some(p => lower.includes(p))) return "BEVERAGE";
    // Categories in the shared BEVERAGE_CATEGORIES list that aren't liquor
    const bevSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));
    if (bevSet.has(lower) && !LIQUOR_CATS.has(lower)) return "BEVERAGE";
    return "FOOD";
}

// Fried Rice is detected by POS category. Restaurant POS systems typically
// have "Fried Rice" as a dedicated category; we match case-insensitive
// substring so variations like "Fried Rice / Noodles" still count.
function isFriedRiceCategory(category: string): boolean {
    return category.toLowerCase().includes("fried rice");
}

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    const fromStr  = searchParams.get("from");
    const toStr    = searchParams.get("to");

    if (!uploadId && !(fromStr && toStr)) {
        return NextResponse.json(
            { error: "Either uploadId or from+to (YYYY-MM-DD) is required" },
            { status: 400 },
        );
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // ── Resolve which uploads contribute, plus the display date(s) ──────────
    interface UploadRow { id: string; periodLabel: string | null; businessDate: Date | null; uploadedAt: Date }
    let uploadIds: string[];
    let periodLabel: string | null;
    let displayDate: Date;
    let rangeFrom: string | null = null;
    let rangeTo:   string | null = null;
    let dayCount  = 1;
    let uploadCount = 1;

    if (uploadId) {
        const upload: UploadRow | null = await db.pmixUpload.findUnique({
            where:  { id: uploadId },
            select: { id: true, periodLabel: true, businessDate: true, uploadedAt: true },
        });
        if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });
        uploadIds   = [upload.id];
        periodLabel = upload.periodLabel;
        displayDate = (upload.businessDate ?? upload.uploadedAt) as Date;
    } else {
        const from = new Date(fromStr + "T00:00:00.000Z");
        const to   = new Date(toStr   + "T23:59:59.999Z");
        if (isNaN(from.getTime()) || isNaN(to.getTime())) {
            return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
        }
        const uploads: UploadRow[] = await db.pmixUpload.findMany({
            where: {
                OR: [
                    { businessDate: { gte: from, lte: to } },
                    { businessDate: null, uploadedAt: { gte: from, lte: to } },
                ],
            },
            select: { id: true, periodLabel: true, businessDate: true, uploadedAt: true },
            orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
        });
        uploadIds   = uploads.map(u => u.id);
        periodLabel = `${fromStr} → ${toStr}`;
        displayDate = uploads[0]
            ? (uploads[0].businessDate ?? uploads[0].uploadedAt) as Date
            : from;
        rangeFrom = fromStr;
        rangeTo   = toStr;
        // Distinct calendar days that have at least one upload
        const dateSet = new Set(
            uploads.map(u => ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10))
        );
        dayCount    = Math.max(1, dateSet.size);
        uploadCount = uploads.length;
    }

    if (uploadIds.length === 0) {
        return NextResponse.json({
            uploadId: null, periodLabel, businessDate: displayDate,
            rangeFrom, rangeTo, dayCount: 0, uploadCount: 0,
            totalSales: 0, totalQty: 0,
            macros: {
                FOOD:     { sales: 0, qty: 0, pct: 0 },
                LIQUOR:   { sales: 0, qty: 0, pct: 0 },
                BEVERAGE: { sales: 0, qty: 0, pct: 0 },
                DESSERT:  { sales: 0, qty: 0, pct: 0 },
            },
            topByCategory: [], bar: { cocktails: [], mocktails: [], beer: [] },
            desserts: [], insights: ["No PMIX data in the selected range."], focus: [],
        });
    }

    const pmixItems: Array<{ itemName: string; category: string; qtySold: number; netSales: unknown }> =
        await db.pmixItem.findMany({
            where:   { uploadId: { in: uploadIds } },
            select:  { itemName: true, category: true, qtySold: true, netSales: true },
        });

    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // ── Classify + GROUP by itemName + category across all uploads ───────────
    // Range mode pulls many uploads — the same menu item appears once per day.
    // We MUST aggregate so each menu item is one row in the dashboard,
    // otherwise the same name shows up multiple times in the top lists.
    interface ItemRow {
        itemName: string;
        category: string;
        qty:      number;
        sales:    number;
        bucket:   Bucket;
    }
    const groupKey = (name: string, cat: string) =>
        `${name.toLowerCase().trim()}|||${cat.toLowerCase().trim()}`;

    const grouped = new Map<string, ItemRow>();
    for (const it of pmixItems) {
        const cat       = (it.category ?? "").trim() || "Uncategorized";
        const name      = it.itemName;
        const qty       = Number(it.qtySold);
        const sales     = Number(it.netSales);
        if (qty === 0 && sales === 0) continue;

        const key = groupKey(name, cat);
        const existing = grouped.get(key);
        if (existing) {
            existing.qty   += qty;
            existing.sales += sales;
        } else {
            const cls       = classifyItem(name, rules);
            const isDessert = cls?.category === "dessert";
            grouped.set(key, {
                itemName: name,
                category: cat,
                qty,
                sales,
                bucket: macroBucket(cat, isDessert),
            });
        }
    }
    const rows: ItemRow[] = [...grouped.values()];

    // ── Macro bucket totals ──────────────────────────────────────────────────
    const macros: Record<Bucket, { sales: number; qty: number }> = {
        FOOD:     { sales: 0, qty: 0 },
        LIQUOR:   { sales: 0, qty: 0 },
        BEVERAGE: { sales: 0, qty: 0 },
        DESSERT:  { sales: 0, qty: 0 },
    };
    // Fried Rice is a *subset* of FOOD (a spotlight KPI), so we count it
    // separately. Total sales still comes from FOOD + LIQUOR + BEVERAGE + DESSERT.
    let friedRiceSales = 0;
    let friedRiceQty   = 0;
    for (const r of rows) {
        macros[r.bucket].sales += r.sales;
        macros[r.bucket].qty   += r.qty;
        if (isFriedRiceCategory(r.category)) {
            friedRiceSales += r.sales;
            friedRiceQty   += r.qty;
        }
    }
    const totalSales = macros.FOOD.sales + macros.LIQUOR.sales + macros.BEVERAGE.sales + macros.DESSERT.sales;
    const macroPct = (b: Bucket) => totalSales > 0 ? +((macros[b].sales / totalSales) * 100).toFixed(1) : 0;
    const friedRicePct = totalSales > 0 ? +((friedRiceSales / totalSales) * 100).toFixed(1) : 0;

    // ── Top items by FOOD category — pinned to 4 fixed groups ────────────────
    // Always show: Appetizers · Noodles · Curry · Fried Rice (in this order).
    // Each group's column lists the top 5 items in that POS category. Empty
    // columns are kept so the layout is consistent across uploads.
    const PINNED_GROUPS: { label: string; patterns: string[] }[] = [
        { label: "Appetizers", patterns: ["appetizer", "appetiser", "starter"] },
        { label: "Noodles",    patterns: ["noodle"] },
        { label: "Curry",      patterns: ["curry"] },
        { label: "Fried Rice", patterns: ["fried rice"] },
    ];

    const topByCategory = PINNED_GROUPS.map(g => {
        const items = rows
            .filter(r => g.patterns.some(p => r.category.toLowerCase().includes(p)))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5)
            .map(r => ({ itemName: r.itemName, qty: r.qty }));
        return { category: g.label, items };
    });

    // ── Bar performance (Cocktails / Mocktails / Beer) ───────────────────────
    function pickByCat(catNames: string[]): { itemName: string; qty: number }[] {
        const lowered = catNames.map(c => c.toLowerCase());
        return rows
            .filter(r => lowered.some(c => r.category.toLowerCase() === c))
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 5)
            .map(r => ({ itemName: r.itemName, qty: r.qty }));
    }
    // BEVERAGE column = items in the BEVERAGE bucket that aren't already
    // listed in Beer / Mocktails (so the column shows sodas, juice, tea,
    // coffee, water, and anything else non-alcoholic). When there is no
    // such "other" beverage, fall back to all BEVERAGE-bucket items.
    const ALREADY_LISTED = new Set(["beer", "mocktails", "mocktail"]);
    const otherBeverage = rows
        .filter(r => r.bucket === "BEVERAGE" && !ALREADY_LISTED.has(r.category.toLowerCase()))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 5)
        .map(r => ({ itemName: r.itemName, qty: r.qty }));

    const bar = {
        cocktails: pickByCat(["Cocktails", "Classic Cocktails"]),
        mocktails: pickByCat(["Mocktails", "Mocktail"]),
        beer:      pickByCat(["Beer"]),
        beverage:  otherBeverage,
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
        uploadId:     uploadId ?? null,
        periodLabel,
        businessDate: displayDate,
        rangeFrom,
        rangeTo,
        dayCount,
        uploadCount,
        totalSales:   +totalSales.toFixed(2),
        totalQty:     rows.reduce((s, r) => s + r.qty, 0),

        macros: {
            FOOD:     { sales: +macros.FOOD.sales.toFixed(2),     qty: macros.FOOD.qty,     pct: macroPct("FOOD") },
            LIQUOR:   { sales: +macros.LIQUOR.sales.toFixed(2),   qty: macros.LIQUOR.qty,   pct: macroPct("LIQUOR") },
            BEVERAGE: { sales: +macros.BEVERAGE.sales.toFixed(2), qty: macros.BEVERAGE.qty, pct: macroPct("BEVERAGE") },
            DESSERT:  { sales: +macros.DESSERT.sales.toFixed(2),  qty: macros.DESSERT.qty,  pct: macroPct("DESSERT") },
        },
        // Friend Rice retained as a separate spotlight figure (used by the
        // pinned "FRIED RICE" column in Top Selling Items; not a KPI card).
        friedRice: { sales: +friedRiceSales.toFixed(2), qty: friedRiceQty, pct: friedRicePct },

        topByCategory,
        bar,
        desserts,
        insights,
        focus,
    });
}
