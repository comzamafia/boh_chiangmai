/**
 * GET /api/pmix/analytics/dessert-daily
 *   ?item=Mango+Sticky+Rice    — exact itemName from Desserts byItem list
 *   &from=YYYY-MM-DD
 *   &to=YYYY-MM-DD
 *
 * Returns per-day order count for one dessert item across the date range.
 * Uses the same hybrid classifier (dessert category) as the range API.
 *
 * Response:
 *   { item, days: { date, qty }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const item    = searchParams.get("item");
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!item || !fromStr || !toStr) {
        return NextResponse.json({ error: "item, from, and to are required" }, { status: 400 });
    }

    const fromDate = new Date(fromStr + "T00:00:00.000Z");
    const toDate   = new Date(toStr   + "T23:59:59.999Z");
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Uploads in range
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
        orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
    });

    if (uploads.length === 0) {
        return NextResponse.json({ item, days: [] });
    }

    // 2. Map upload → date
    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 3. Items matching the exact itemName (case-insensitive)
    const pmixItems = await db.pmixItem.findMany({
        where:   {
            uploadId: { in: uploadIds },
            itemName: { equals: item, mode: "insensitive" },
        },
        include: { modifiers: true },
    });

    // 4. Item rules
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 5. Accumulate per-day qty (only count rows that classify as dessert)
    const dayQty = new Map<string, number>();

    for (const pmixItem of pmixItems) {
        const dishName = pmixItem.itemName as string;
        const qty      = Number(pmixItem.qtySold ?? 0);
        if (qty === 0) continue;

        const date = uploadDateMap.get(pmixItem.uploadId as string);
        if (!date) continue;

        const mods = pmixItem.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        // Items that have protein modifiers are never desserts
        if (hasProteinModifier(mods)) continue;

        const result = classifyItem(dishName, rules);
        if (!result || result.category !== "dessert") continue;

        dayQty.set(date, (dayQty.get(date) ?? 0) + qty);
    }

    const days = [...dayQty.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, qty]) => ({ date, qty }));

    return NextResponse.json({ item, days });
}
