/**
 * Daily / weekly storage-area stock digest.
 * Called by /api/cron/inventory-digest-daily.
 */
import * as React from "react";
import { prisma } from "@/lib/db";
import { sendAlert, bkkDateKey } from "../send";
import { getAreaRecipients } from "../recipients";
import { DailyDigest, type DigestItem } from "../templates/DailyDigest";
import { APP_URL } from "../email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface DigestRunSummary {
    areasChecked: number;
    areasSent:    number;
    totalItems:   number;
    sent:         number;
    skipped:      number;
    failed:       number;
}

export async function runDailyDigest(opts: { cadence?: "daily" | "weekly"; branchId: string }): Promise<DigestRunSummary> {
    const cadence = opts.cadence ?? "daily";
    const branchId = opts.branchId;

    // 1. Pull all inventory items with low stock, ingredient + storage area
    const items = await db.inventoryItem.findMany({
        where: {
            branchId,
            ingredient: { storageAreaId: { not: null } },
        },
        include: {
            ingredient: {
                include: {
                    storageArea: true,
                    supplier:    { select: { name: true } },
                },
            },
        },
    });

    interface LowStockRow {
        id: string;
        currentStock: number;
        parMin: number;
        parMax: number;
        reorderPoint: number;
        ingredient: {
            id: string;
            name: string;
            recipeUnit: string;
            purchaseUnit: string;
            conversionRate: number;
            storageAreaId: string | null;
            storageArea: { id: string; name: string; notifyEnabled: boolean; digestSchedule: string } | null;
            supplier: { name: string } | null;
        };
    }

    // 2. Bucket by storage area
    const buckets = new Map<string, { areaName: string; areaId: string; items: DigestItem[] }>();
    for (const it of items as LowStockRow[]) {
        const cur  = Number(it.currentStock);
        const par  = Number(it.parMin);
        const ro   = Number(it.reorderPoint);
        const max  = Number(it.parMax);
        const sev: "critical" | "low" | null =
            cur <= par ? "critical" :
            cur <= ro  ? "low"      :
            null;
        if (!sev) continue;

        const area = it.ingredient.storageArea;
        if (!area || !area.notifyEnabled) continue;
        // Match cadence: daily areas in daily run, weekly in weekly run
        if (cadence === "daily"  && area.digestSchedule !== "daily")  continue;
        if (cadence === "weekly" && area.digestSchedule !== "weekly") continue;

        const conv = Number(it.ingredient.conversionRate);
        const suggestedRecipeQty = Math.max(0, max - cur);
        const suggestedPurchaseQty = conv > 0 ? suggestedRecipeQty / conv : 0;

        const bucket = buckets.get(area.id) ?? { areaName: area.name, areaId: area.id, items: [] };
        bucket.items.push({
            name:          it.ingredient.name,
            currentStock:  cur,
            parMin:        par,
            reorderPoint:  ro,
            recipeUnit:    it.ingredient.recipeUnit,
            severity:      sev,
            suggestedQty:  suggestedPurchaseQty > 0 ? +suggestedPurchaseQty.toFixed(2) : undefined,
            purchaseUnit:  it.ingredient.purchaseUnit,
            supplierName:  it.ingredient.supplier?.name,
        });
        buckets.set(area.id, bucket);
    }

    // 3. Send one digest per area
    const dateKey = bkkDateKey();
    const summary: DigestRunSummary = {
        areasChecked: buckets.size, areasSent: 0, totalItems: 0,
        sent: 0, skipped: 0, failed: 0,
    };

    for (const [areaId, bucket] of buckets) {
        const recipients = await getAreaRecipients(areaId, "low");
        if (recipients.length === 0) continue;

        // Sort: critical first, then by lowest stock
        bucket.items.sort((a, b) => {
            if (a.severity !== b.severity) return a.severity === "critical" ? -1 : 1;
            return a.currentStock - b.currentStock;
        });

        const critCount = bucket.items.filter(i => i.severity === "critical").length;
        const lowCount  = bucket.items.length - critCount;
        const subject =
            `📦 ${bucket.areaName} — ${cadence === "daily" ? "Daily" : "Weekly"} Stock (` +
            (critCount > 0 ? `${critCount} critical` : "") +
            (critCount > 0 && lowCount > 0 ? ", " : "") +
            (lowCount  > 0 ? `${lowCount} to reorder` : "") + ")";

        const res = await sendAlert({
            type:          "low_stock_digest",
            dedupeKey:     `low_stock_digest:${areaId}:${dateKey}:${cadence}`,
            subject,
            branchId,
            storageAreaId: areaId,
            recipients,
            react: React.createElement(DailyDigest, {
                storageAreaName: bucket.areaName,
                storageAreaId:   areaId,
                items:           bucket.items,
                appUrl:          APP_URL,
                cadence,
            }),
        });

        summary.totalItems += bucket.items.length;
        summary.sent       += res.sent;
        summary.skipped    += res.skipped;
        summary.failed     += res.failed;
        if (res.sent > 0) summary.areasSent += 1;
    }

    return summary;
}
