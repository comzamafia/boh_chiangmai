/**
 * Order-reminder trigger.
 *
 * Logic:
 *  • Find suppliers with a delivery schedule whose nextOrderBy is within the
 *    next N hours (default 14 — so a 6 AM run catches a 5 PM same-day cutoff,
 *    or a 5 PM next-day cutoff).
 *  • For each supplier, list InventoryItems linked to that supplier where
 *    currentStock <= reorderPoint.
 *  • Group by storage area → resolve watchers → send one OrderReminder email
 *    listing all the supplier's items needing reorder.
 *
 * Dedupe: order_reminder:{supplierId}:{dateKey}  (so a supplier with two
 * cutoffs in 14h still only triggers once per day).
 */
import * as React from "react";
import { prisma } from "@/lib/db";
import { sendAlert, localDateKey } from "../send";
import { getAreaRecipients } from "../recipients";
import { OrderReminder, type OrderReminderItem } from "../templates/OrderReminder";
import { APP_URL } from "../email";
import { calculateLeadTime } from "@/lib/supplier-lead-time";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface OrderReminderRunSummary {
    suppliersChecked: number;
    suppliersDue:     number;
    suppliersNotified: number;
    totalItems:       number;
    sent:             number;
    skipped:          number;
    failed:           number;
}

function formatBkkLocal(d: Date, fmt: "date" | "datetime"): string {
    const opts: Intl.DateTimeFormatOptions = fmt === "date"
        ? { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric" }
        : { timeZone: "America/Toronto", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" };
    return new Intl.DateTimeFormat("en-CA", opts).format(d);
}

export async function runOrderReminders(opts: { windowHours?: number; branchId: string }): Promise<OrderReminderRunSummary> {
    const windowHours = opts.windowHours ?? 14;
    const branchId = opts.branchId;
    const now = new Date();
    const windowEnd = new Date(now.getTime() + windowHours * 3600_000);

    // 1. Load all active suppliers with a delivery schedule + their inventory items
    const suppliers = await db.supplier.findMany({
        where: { status: "Active", branchId },
        include: {
            ingredients: {
                include: {
                    inventoryItem: true,
                    storageArea:   { select: { id: true, name: true, notifyEnabled: true } },
                },
            },
        },
    });

    const summary: OrderReminderRunSummary = {
        suppliersChecked: suppliers.length, suppliersDue: 0, suppliersNotified: 0,
        totalItems: 0, sent: 0, skipped: 0, failed: 0,
    };

    const dateKey = localDateKey(now);

    for (const sup of suppliers) {
        // Skip suppliers without a delivery schedule
        if (!sup.deliveryDays || sup.deliveryDays.length === 0) continue;

        const lt = calculateLeadTime({
            deliveryDays:         sup.deliveryDays,
            orderCutoffTime:      sup.orderCutoffTime,
            orderCutoffDayOffset: sup.orderCutoffDayOffset,
        }, now);

        if (!lt.nextOrderBy) continue;
        if (lt.nextOrderBy > windowEnd) continue; // cutoff too far away

        summary.suppliersDue += 1;

        const hoursUntilCutoff = (lt.nextOrderBy.getTime() - now.getTime()) / 3600_000;

        // 2. Find items needing reorder from this supplier (bucket by area)
        interface IngRow {
            id: string; name: string; recipeUnit: string; purchaseUnit: string; conversionRate: number;
            inventoryItem: { id: string; currentStock: number; reorderPoint: number; parMax: number; parMin: number } | null;
            storageArea: { id: string; name: string; notifyEnabled: boolean } | null;
        }
        const itemsByArea = new Map<string, { areaName: string; items: OrderReminderItem[] }>();
        for (const ing of sup.ingredients as IngRow[]) {
            if (!ing.inventoryItem) continue;
            const cur = Number(ing.inventoryItem.currentStock);
            const rop = Number(ing.inventoryItem.reorderPoint);
            if (cur > rop) continue;        // not low yet
            if (!ing.storageArea || !ing.storageArea.notifyEnabled) continue;

            const max  = Number(ing.inventoryItem.parMax);
            const conv = Number(ing.conversionRate);
            const shortRecipe   = Math.max(0, max - cur);
            const shortPurchase = conv > 0 ? shortRecipe / conv : shortRecipe;

            const bucket = itemsByArea.get(ing.storageArea.id) ??
                { areaName: ing.storageArea.name, items: [] };
            bucket.items.push({
                name:         ing.name,
                currentStock: cur,
                reorderPoint: rop,
                parMax:       max,
                recipeUnit:   ing.recipeUnit,
                purchaseUnit: ing.purchaseUnit,
                suggestedQty: shortPurchase,
                storageArea:  ing.storageArea.name,
            });
            itemsByArea.set(ing.storageArea.id, bucket);
        }

        if (itemsByArea.size === 0) continue; // no items below ROP for this supplier
        summary.totalItems += [...itemsByArea.values()].reduce((s, b) => s + b.items.length, 0);

        // 3. Resolve unique watchers across all affected areas
        const recipientMap = new Map<string, { userId: string; email: string; name?: string }>();
        for (const [areaId] of itemsByArea) {
            const r = await getAreaRecipients(areaId, "low");
            for (const rec of r) {
                if (!recipientMap.has(rec.email)) {
                    recipientMap.set(rec.email, { userId: rec.userId ?? "", email: rec.email, name: rec.name });
                }
            }
        }
        const recipients = [...recipientMap.values()];
        if (recipients.length === 0) continue;

        // 4. Flatten items, sort critical-first
        const flatItems = [...itemsByArea.values()].flatMap(b => b.items)
            .sort((a, b) => (a.currentStock / Math.max(a.reorderPoint, 0.0001)) - (b.currentStock / Math.max(b.reorderPoint, 0.0001)));

        const subject = `🛒 Order ${sup.name} by ${formatBkkLocal(lt.nextOrderBy, "datetime")} — ${flatItems.length} item${flatItems.length === 1 ? "" : "s"} below ROP`;

        const res = await sendAlert({
            type:      "order_reminder",
            dedupeKey: `order_reminder:${sup.id}:${dateKey}`,
            subject,
            branchId,
            recipients,
            react: React.createElement(OrderReminder, {
                supplierName:     sup.name,
                supplierContact:  sup.contact ?? null,
                supplierEmail:    sup.email ?? null,
                supplierPhone:    sup.phone ?? null,
                deliveryNotes:    sup.deliveryNotes ?? null,
                minOrderValue:    sup.minOrderValue != null ? Number(sup.minOrderValue) : null,
                nextDeliveryDate: formatBkkLocal(lt.nextDeliveryDate ?? lt.nextOrderBy, "date"),
                orderByDateTime:  formatBkkLocal(lt.nextOrderBy, "datetime"),
                hoursUntilCutoff,
                items:            flatItems,
                appUrl:           APP_URL,
            }),
        });

        summary.sent       += res.sent;
        summary.skipped    += res.skipped;
        summary.failed     += res.failed;
        if (res.sent > 0) summary.suppliersNotified += 1;
    }

    return summary;
}
