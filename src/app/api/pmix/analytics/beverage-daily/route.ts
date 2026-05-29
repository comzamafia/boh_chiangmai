/**
 * GET /api/pmix/analytics/beverage-daily
 *   ?group=Beer            — exact POS category name (e.g. "Beer", "Red Wine")
 *   &from=YYYY-MM-DD
 *   &to=YYYY-MM-DD
 *
 * Returns per-day order count for one beverage group across the date range.
 * Groups are matched by the POS item.category field (case-insensitive).
 *
 * Response: { group, days: { date, qty }[] }
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

    // Validate group is a known beverage category
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
        return NextResponse.json({ group, days: [] });
    }

    // 2. Map upload → date
    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 3. Fetch items whose POS category matches this group (case-insensitive)
    const pmixItems = await db.pmixItem.findMany({
        where: {
            uploadId: { in: uploadIds },
            category: { equals: group, mode: "insensitive" },
        },
        select: { uploadId: true, qtySold: true },
    });

    // 4. Sum qty per day
    const dayQty = new Map<string, number>();
    for (const item of pmixItems) {
        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;
        const qty = Number(item.qtySold ?? 0);
        if (qty === 0) continue;
        dayQty.set(date, (dayQty.get(date) ?? 0) + qty);
    }

    const days = [...dayQty.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, qty]) => ({ date, qty }));

    return NextResponse.json({ group, days });
}
