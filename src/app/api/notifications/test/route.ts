/**
 * POST /api/notifications/test
 * Body: { storageAreaId: string, type: "digest" | "critical" }
 *
 * Sends a single test email to the current user (must be a watcher of the area
 * OR admin) using the requested template populated with sample data.
 */
import * as React from "react";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendAlert } from "@/lib/notifications/send";
import { DailyDigest } from "@/lib/notifications/templates/DailyDigest";
import { CriticalStockAlert } from "@/lib/notifications/templates/CriticalStockAlert";
import { APP_URL } from "@/lib/notifications/email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { storageAreaId, type } = await req.json();
    if (!storageAreaId || !["digest", "critical"].includes(type)) {
        return NextResponse.json({ error: "storageAreaId and valid type required" }, { status: 400 });
    }

    const area = await db.storageArea.findUnique({ where: { id: storageAreaId } });
    if (!area) return NextResponse.json({ error: "Area not found" }, { status: 404 });

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const dedupeKey = `test:${type}:${storageAreaId}:${session.userId}:${Date.now()}`;

    if (type === "digest") {
        const sample = [
            { name: "Tiger Prawn 16/20", currentStock: 0.8, parMin: 2,  reorderPoint: 3, recipeUnit: "kg", severity: "critical" as const, suggestedQty: 5,  purchaseUnit: "kg",  supplierName: "Sea Co." },
            { name: "Coconut Milk",      currentStock: 6,   parMin: 4,  reorderPoint: 8, recipeUnit: "L",  severity: "low"      as const, suggestedQty: 12, purchaseUnit: "L",   supplierName: "Asia Pacific" },
            { name: "Pad Thai Sauce",    currentStock: 2,   parMin: 1,  reorderPoint: 3, recipeUnit: "kg", severity: "low"      as const },
        ];
        const res = await sendAlert({
            type:    "low_stock_digest",
            dedupeKey,
            subject: `📦 [TEST] ${area.name} — Daily Stock (1 critical, 2 to reorder)`,
            storageAreaId,
            recipients: [{ userId: user.id, email: user.email, name: user.name }],
            react: React.createElement(DailyDigest, {
                storageAreaName: area.name,
                storageAreaId,
                items: sample,
                appUrl: APP_URL,
                recipientName: user.name,
                cadence: "daily",
            }),
        });
        return NextResponse.json({ ok: res.sent > 0, ...res });
    }

    // critical
    const res = await sendAlert({
        type:    "critical_stock",
        dedupeKey,
        subject: `🔴 [TEST] Critical: Tiger Prawn 16/20 below safety stock in ${area.name}`,
        storageAreaId,
        recipients: [{ userId: user.id, email: user.email, name: user.name }],
        react: React.createElement(CriticalStockAlert, {
            storageAreaName: area.name,
            storageAreaId,
            ingredientName:  "Tiger Prawn 16/20",
            ingredientId:    "sample-ingredient-id",
            currentStock:    0.8,
            parMin:          2,
            recipeUnit:      "kg",
            leadTimeDays:    2,
            triggeredBy:     "Out: 1.2 kg used for Pad Thai (15 servings)",
            supplierName:    "Sea Co.",
            appUrl:          APP_URL,
            recipientName:   user.name,
        }),
    });
    return NextResponse.json({ ok: res.sent > 0, ...res });
}
