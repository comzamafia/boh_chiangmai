/**
 * POST /api/notifications/test
 * Body: { storageAreaId: string, type: "digest" | "critical" }
 *
 * Sends a single test email to the current user using the requested template
 * populated with sample data. Wraps everything in try/catch and returns the
 * underlying error message so we can diagnose Resend / Prisma / render issues.
 */
import * as React from "react";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { sendAlert } from "@/lib/notifications/send";
import { DailyDigest } from "@/lib/notifications/templates/DailyDigest";
import { CriticalStockAlert } from "@/lib/notifications/templates/CriticalStockAlert";
import { APP_URL, FROM_EMAIL } from "@/lib/notifications/email";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

interface ErrorPayload { error: string; stage: string; details?: string }

function fail(stage: string, e: unknown, status = 500): NextResponse<ErrorPayload> {
    const details = e instanceof Error ? e.message : String(e);
    console.error(`[notif-test:${stage}]`, e);
    return NextResponse.json({ error: `Failed at ${stage}`, stage, details }, { status });
}

export async function POST(req: NextRequest) {
    let stage = "auth";
    try {
        const session = await getSession();
        if (!session) return NextResponse.json({ error: "Unauthorized", stage }, { status: 401 });

        stage = "parse-body";
        const { storageAreaId, type, overrideEmail } = await req.json();
        if (!storageAreaId || !["digest", "critical"].includes(type)) {
            return NextResponse.json({ error: "storageAreaId and valid type required", stage }, { status: 400 });
        }

        stage = "env-check";
        const envIssues: string[] = [];
        if (!process.env.RESEND_API_KEY) envIssues.push("RESEND_API_KEY missing");
        if (!process.env.EMAIL_FROM)     envIssues.push("EMAIL_FROM missing (using fallback)");
        if (envIssues.length > 0) console.warn("[notif-test] env warnings:", envIssues);

        stage = "load-area";
        const area = await db.storageArea.findUnique({ where: { id: storageAreaId } });
        if (!area) return NextResponse.json({ error: "Area not found", stage }, { status: 404 });

        stage = "load-user";
        const user = await db.user.findUnique({ where: { id: session.userId } });
        if (!user) return NextResponse.json({ error: "User not found", stage }, { status: 404 });

        // Allow overriding the recipient email for sandboxed Resend testing
        const recipientEmail = (overrideEmail ?? user.email) as string;
        const recipientName  = overrideEmail ? "Test recipient" : user.name;

        const dedupeKey = `test:${type}:${storageAreaId}:${session.userId}:${Date.now()}`;

        stage = "render-and-send";
        let res;
        if (type === "digest") {
            const sample = [
                { name: "Tiger Prawn 16/20", currentStock: 0.8, parMin: 2,  reorderPoint: 3, recipeUnit: "kg", severity: "critical" as const, suggestedQty: 5,  purchaseUnit: "kg",  supplierName: "Sea Co." },
                { name: "Coconut Milk",      currentStock: 6,   parMin: 4,  reorderPoint: 8, recipeUnit: "L",  severity: "low"      as const, suggestedQty: 12, purchaseUnit: "L",   supplierName: "Asia Pacific" },
                { name: "Pad Thai Sauce",    currentStock: 2,   parMin: 1,  reorderPoint: 3, recipeUnit: "kg", severity: "low"      as const },
            ];
            res = await sendAlert({
                type:    "low_stock_digest",
                dedupeKey,
                subject: `📦 [TEST] ${area.name} — Daily Stock (1 critical, 2 to reorder)`,
                storageAreaId,
                recipients: [{ userId: user.id, email: recipientEmail, name: recipientName }],
                react: React.createElement(DailyDigest, {
                    storageAreaName: area.name,
                    storageAreaId,
                    items: sample,
                    appUrl: APP_URL,
                    recipientName: user.name,
                    cadence: "daily",
                }),
            });
        } else {
            res = await sendAlert({
                type:    "critical_stock",
                dedupeKey,
                subject: `🔴 [TEST] Critical: Tiger Prawn 16/20 below safety stock in ${area.name}`,
                storageAreaId,
                recipients: [{ userId: user.id, email: recipientEmail, name: recipientName }],
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
        }

        return NextResponse.json({
            ok: res.sent > 0,
            ...res,
            from: FROM_EMAIL,
            to:   recipientEmail,
            envIssues: envIssues.length ? envIssues : undefined,
        });
    } catch (e) {
        return fail(stage, e);
    }
}
