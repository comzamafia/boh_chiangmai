/**
 * GET /api/pmix/analytics/dessert-heatmap?days=7
 *
 * Returns dessert daily usage for the last N calendar days.
 * Rows = each dessert menu item, columns = each date.
 * Bal + Order columns supplied by fuzzy-matching to InventoryItem.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { classifyItem, hasMainProteinModifier, type RuleRow } from "@/lib/pmix-classifier";
import { loadInventoryByName, fuzzyMatchInventory, toDisplayQty } from "@/lib/inventory-match";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

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
            branchId,
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
        orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
    });
    if (uploads.length === 0) return NextResponse.json({ dates, items: [], days, latestDataDate: null });

    const uploadDateMap = new Map<string, string>();
    let latestDataDate: string | null = null;
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
        if (!latestDataDate || date > latestDataDate) latestDataDate = date;
    }
    const uploadIds = uploads.map((u: { id: string }) => u.id);

    const pmixItems = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds }, branchId },
        include: { modifiers: true },
    });
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true, branchId },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });
    const invByName = await loadInventoryByName(branchId);

    // itemName → date → qty
    const dessertDay = new Map<string, Map<string, number>>();

    for (const item of pmixItems) {
        const dishName = item.itemName as string;
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0) continue;
        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;
        if (hasMainProteinModifier(mods)) continue;
        const cls = classifyItem(dishName, rules);
        if (!cls || cls.category !== "dessert") continue;

        if (!dessertDay.has(dishName)) dessertDay.set(dishName, new Map());
        const m = dessertDay.get(dishName)!;
        m.set(date, (m.get(date) ?? 0) + qty);
    }

    const r3 = (n: number) => Math.round(n * 1000) / 1000;

    const items = [...dessertDay.entries()]
        .map(([itemName, dateMap]) => {
            const inv      = fuzzyMatchInventory(itemName, invByName);
            const byDateRaw = dates.map(d => dateMap.get(d) ?? 0);
            const totalRaw  = byDateRaw.reduce((s, q) => s + q, 0);

            // Display unit: purchase unit if inventory matched, otherwise "orders"
            const unit = inv ? toDisplayQty(0, inv).unit : "orders";
            const conv = (q: number) => inv ? toDisplayQty(q, inv).qty : q;

            const totalQty = r3(conv(totalRaw));
            const tracked  = !!inv;
            return {
                itemName,
                unit,
                totalOrders:    totalRaw,
                totalQty,
                avgPerDay:      r3(totalQty / days),
                byDate:         byDateRaw.map(q => r3(conv(q))),
                inventoryItemId: inv?.inventoryItemId ?? null,
                inventoryTracked: tracked,
                // Default to 0 (not null) so the UI computes Bal = 0 - sold
                // and Order = +sold when the item isn't tracked yet.
                currentStock:    inv ? r3(inv.currentStock / (inv.conversionRate > 0 ? inv.conversionRate : 1)) : 0,
                parMin:          inv ? r3(inv.parMin       / (inv.conversionRate > 0 ? inv.conversionRate : 1)) : 0,
            };
        })
        .filter(r => r.totalOrders > 0)
        .sort((a, b) => b.totalOrders - a.totalOrders);

    return NextResponse.json({ dates, items, days, latestDataDate });
}
