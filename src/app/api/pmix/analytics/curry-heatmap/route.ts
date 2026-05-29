/**
 * GET /api/pmix/analytics/curry-heatmap?days=7
 *
 * Returns curry-group daily usage for the last N calendar days.
 * Rows = each curry group (Khao Soi, Green Curry, Panang …),
 * Columns = each date. Bal + Order columns supplied by fuzzy-matching
 * the group label to InventoryItem (often returns null — curries have
 * no single key ingredient).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { matchCurryGroup } from "@/lib/curry-categories";
import { loadInventoryByName, fuzzyMatchInventory, toDisplayQty } from "@/lib/inventory-match";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(30, Number(searchParams.get("days") ?? 7)));

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    const fromDate = new Date(dates[0] + "T00:00:00.000Z");
    const toDate   = new Date(dates[dates.length - 1] + "T23:59:59.999Z");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
    });
    if (uploads.length === 0) return NextResponse.json({ dates, items: [], days });

    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
    }
    const uploadIds = uploads.map((u: { id: string }) => u.id);

    const pmixItems = await db.pmixItem.findMany({
        where:  { uploadId: { in: uploadIds } },
        select: { uploadId: true, itemName: true, qtySold: true },
    });

    const invByName = await loadInventoryByName();

    // group label → date → qty
    const curryDay = new Map<string, Map<string, number>>();

    for (const item of pmixItems) {
        const matched = matchCurryGroup(item.itemName as string);
        if (!matched) continue;
        const qty = Number(item.qtySold ?? 0);
        if (qty === 0) continue;
        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;

        if (!curryDay.has(matched)) curryDay.set(matched, new Map());
        const m = curryDay.get(matched)!;
        m.set(date, (m.get(date) ?? 0) + qty);
    }

    const r3 = (n: number) => Math.round(n * 1000) / 1000;

    const items = [...curryDay.entries()]
        .map(([group, dateMap]) => {
            const inv       = fuzzyMatchInventory(group, invByName);
            const byDateRaw = dates.map(d => dateMap.get(d) ?? 0);
            const totalRaw  = byDateRaw.reduce((s, q) => s + q, 0);

            const unit = inv ? toDisplayQty(0, inv).unit : "orders";
            const conv = (q: number) => inv ? toDisplayQty(q, inv).qty : q;

            const totalQty = r3(conv(totalRaw));
            const tracked  = !!inv;
            return {
                group,
                unit,
                totalOrders:     totalRaw,
                totalQty,
                avgPerDay:       r3(totalQty / days),
                byDate:          byDateRaw.map(q => r3(conv(q))),
                inventoryItemId: inv?.inventoryItemId ?? null,
                inventoryTracked: tracked,
                currentStock:    inv ? r3(inv.currentStock / (inv.conversionRate > 0 ? inv.conversionRate : 1)) : 0,
                parMin:          inv ? r3(inv.parMin       / (inv.conversionRate > 0 ? inv.conversionRate : 1)) : 0,
            };
        })
        .filter(r => r.totalOrders > 0)
        .sort((a, b) => b.totalOrders - a.totalOrders);

    return NextResponse.json({ dates, items, days });
}
