/**
 * Real-time critical-stock trigger.
 * Called inline from inventory transaction routes after stock has been written.
 * Fire-and-forget: returned promise should NOT block the API response.
 */
import * as React from "react";
import { prisma } from "@/lib/db";
import { sendAlert, bkkDateKey } from "../send";
import { getAreaRecipients } from "../recipients";
import { CriticalStockAlert } from "../templates/CriticalStockAlert";
import { APP_URL } from "../email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export interface CriticalCheckParams {
    inventoryItemId: string;
    triggeredBy:     string;     // human-readable txn description
    prevStock?:      number;     // stock BEFORE the txn (to detect threshold crossing)
}

/** Check one inventory item; if it crossed parMin, send critical alert. */
export async function checkCriticalStock(p: CriticalCheckParams): Promise<void> {
    const item = await db.inventoryItem.findUnique({
        where:   { id: p.inventoryItemId },
        include: {
            ingredient: {
                include: {
                    storageArea: true,
                    supplier:    { select: { name: true } },
                },
            },
        },
    });
    if (!item) return;

    const cur    = Number(item.currentStock);
    const parMin = Number(item.parMin);
    if (cur > parMin) return;                 // not critical

    // Only fire on crossing: prevStock above, now below
    if (p.prevStock != null && p.prevStock <= parMin) return;

    const area = item.ingredient.storageArea;
    if (!area || !area.notifyEnabled) return;

    const recipients = await getAreaRecipients(area.id, "critical");
    if (recipients.length === 0) return;

    const dateKey = bkkDateKey();
    const subject = `🔴 Critical: ${item.ingredient.name} below safety stock in ${area.name}`;

    await sendAlert({
        type:          "critical_stock",
        dedupeKey:     `critical_stock:${item.id}:${dateKey}`,
        subject,
        branchId:      item.branchId,
        storageAreaId: area.id,
        ingredientId:  item.ingredient.id,
        recipients,
        react: React.createElement(CriticalStockAlert, {
            storageAreaName: area.name,
            storageAreaId:   area.id,
            ingredientName:  item.ingredient.name,
            ingredientId:    item.ingredient.id,
            currentStock:    cur,
            parMin,
            recipeUnit:      item.ingredient.recipeUnit,
            leadTimeDays:    item.leadTimeDays,
            triggeredBy:     p.triggeredBy,
            supplierName:    item.ingredient.supplier?.name,
            appUrl:          APP_URL,
        }),
    });
}

/** Fire-and-forget wrapper. Use this from API routes. */
export function fireCriticalStockCheck(p: CriticalCheckParams): void {
    void checkCriticalStock(p).catch(err => {
        console.error("[critical-stock] check failed:", err);
    });
}
