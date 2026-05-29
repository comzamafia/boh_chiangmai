/**
 * GET /api/pmix/analytics/curry-daily
 *   ?group=Khao+Soi      — canonical curry group label
 *   &from=YYYY-MM-DD
 *   &to=YYYY-MM-DD
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
import { CURRY_LABELS, matchCurryGroup } from "@/lib/curry-categories";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

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
    if (!CURRY_LABELS.some(l => l.toLowerCase() === group.toLowerCase())) {
        return NextResponse.json({ error: "Unknown curry group" }, { status: 400 });
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

    // 2. Fetch all items in window — we need to filter via matchCurryGroup()
    //    since curry detection is pattern-based, not a single DB column.
    const pmixItems = await db.pmixItem.findMany({
        where:  { uploadId: { in: uploadIds } },
        select: { uploadId: true, itemName: true, qtySold: true },
    });

    const targetGroup = group.toLowerCase();
    const dayQty  = new Map<string, number>();
    const itemDay = new Map<string, Map<string, number>>();

    for (const item of pmixItems) {
        const name = item.itemName as string;
        const matched = matchCurryGroup(name);
        if (!matched || matched.toLowerCase() !== targetGroup) continue;

        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;
        const qty = Number(item.qtySold ?? 0);
        if (qty === 0) continue;

        dayQty.set(date, (dayQty.get(date) ?? 0) + qty);

        if (!itemDay.has(name)) itemDay.set(name, new Map());
        const m = itemDay.get(name)!;
        m.set(date, (m.get(date) ?? 0) + qty);
    }

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
