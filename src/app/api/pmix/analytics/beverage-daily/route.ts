/**
 * GET /api/pmix/analytics/beverage-daily
 *   ?group=Beer            — exact POS category name (e.g. "Beer", "Red Wine")
 *   &from=YYYY-MM-DD
 *   &to=YYYY-MM-DD
 *
 * Returns:
 *   - days[]        — total qty per day for the group
 *   - byItem[]      — each unique menu item with total qty + per-day breakdown
 *
 * Response:
 *   {
 *     group,
 *     days:   [{ date, qty }],
 *     byItem: [{ itemName, totalQty, avgPerDay, days: [{ date, qty }] }]
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { BEVERAGE_CATEGORIES } from "@/lib/beverage-categories";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const group   = searchParams.get("group");
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!group || !fromStr || !toStr) {
        return NextResponse.json({ error: "group, from, and to are required" }, { status: 400 });
    }

    if (!BEVERAGE_CATEGORIES.some(bc => bc.toLowerCase() === group.toLowerCase())) {
        return NextResponse.json({ error: "Unknown beverage group" }, { status: 400 });
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
        return NextResponse.json({ group, days: [], byItem: [] });
    }

    // 2. Map upload → date
    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
    }

    const rangeDays = Math.max(
        1,
        Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000) + 1,
    );

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 3. Fetch all items in this category — include itemName for breakdown
    const pmixItems = await db.pmixItem.findMany({
        where: {
            uploadId: { in: uploadIds },
            category: { equals: group, mode: "insensitive" },
        },
        select: { uploadId: true, itemName: true, qtySold: true },
    });

    // 4. Accumulate group total per day + per-item per-day
    const dayQty  = new Map<string, number>();                              // date → group total
    const itemDay = new Map<string, Map<string, number>>();                 // itemName → date → qty

    for (const item of pmixItems) {
        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;
        const qty      = Number(item.qtySold ?? 0);
        const itemName = (item.itemName as string) ?? "Unknown";
        if (qty === 0) continue;

        // Group daily total
        dayQty.set(date, (dayQty.get(date) ?? 0) + qty);

        // Per-item daily
        if (!itemDay.has(itemName)) itemDay.set(itemName, new Map());
        const m = itemDay.get(itemName)!;
        m.set(date, (m.get(date) ?? 0) + qty);
    }

    // 5. Build response
    const days = [...dayQty.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, qty]) => ({ date, qty }));

    const byItem = [...itemDay.entries()]
        .map(([itemName, dateMap]) => {
            const totalQty = [...dateMap.values()].reduce((s, q) => s + q, 0);
            const itemDays = [...dateMap.entries()]
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([date, qty]) => ({ date, qty }));
            return {
                itemName,
                totalQty,
                avgPerDay: +(totalQty / rangeDays).toFixed(2),
                days: itemDays,
            };
        })
        .sort((a, b) => b.totalQty - a.totalQty);

    return NextResponse.json({ group, days, byItem });
}
