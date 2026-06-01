/**
 * GET /api/pmix/uncategorized
 *
 * Scans recent PMIX uploads and returns the DISTINCT item names that match NO
 * active classification rule (and whose main protein is not chosen via a
 * "Choice of Protein" modifier group). These are the items an admin should
 * turn into rules — surfaced for one-click "Quick add" on the PMIX Rules page.
 *
 * Query:
 *   ?days=N   — look-back window in days (default 365, max 730)
 *
 * Response: { window: { from, to }, items: { itemName, category, qty, days }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const daysParam = Number(searchParams.get("days") ?? 365);
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 365, 1), 730);

    const toDate   = new Date();
    const fromDate = new Date(toDate.getTime() - days * 24 * 60 * 60 * 1000);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Uploads in the look-back window
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
    });

    if (uploads.length === 0) {
        return NextResponse.json({
            window: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
            items: [],
        });
    }

    const uploadIds   = uploads.map((u: { id: string }) => u.id);
    const uploadDate  = new Map<string, string>();
    for (const u of uploads) {
        uploadDate.set(u.id as string, ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10));
    }

    // 2. Active rules
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 3. Items + modifiers
    const items = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds } },
        include: { modifiers: true },
    });

    const bevSet = new Set(BEVERAGE_CATEGORIES.map(c => c.toLowerCase()));

    // 4. Aggregate uncategorized dish names
    const map = new Map<string, { itemName: string; category: string; qty: number; dates: Set<string> }>();

    for (const item of items) {
        const dishName = item.itemName as string;
        const category = (item.category as string) ?? "";
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0 || !dishName) continue;
        if (bevSet.has(category.toLowerCase())) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;
        // Protein chosen via a modifier group → not a dish-name rule concern
        if (hasMainProteinModifier(mods)) continue;

        const result = classifyItem(dishName, rules);
        if (result) continue; // already classified (or excluded) — not "uncategorized"

        const date = uploadDate.get(item.uploadId as string) ?? "";
        const ex = map.get(dishName);
        if (ex) { ex.qty += qty; if (date) ex.dates.add(date); }
        else    { map.set(dishName, { itemName: dishName, category, qty, dates: new Set(date ? [date] : []) }); }
    }

    const result = [...map.values()]
        .map(r => ({ itemName: r.itemName, category: r.category, qty: r.qty, days: r.dates.size }))
        .sort((a, b) => b.qty - a.qty || a.itemName.localeCompare(b.itemName));

    return NextResponse.json({
        window: { from: fromDate.toISOString().slice(0, 10), to: toDate.toISOString().slice(0, 10) },
        items: result,
    });
}
