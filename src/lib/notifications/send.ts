/**
 * sendAlert() — single entry point for every notification.
 *
 * Responsibilities:
 *   1. Dedupe by NotificationLog.dedupeKey (skip if already sent today)
 *   2. Render React Email component → html + text
 *   3. Send via Resend (one row per recipient)
 *   4. Log every attempt to NotificationLog
 */
import { prisma } from "@/lib/db";
import { render } from "@react-email/render";
import { sendEmail } from "./email";
import * as React from "react";

export type NotificationType =
    | "low_stock_digest"
    | "critical_stock"
    | "stocktake_due"
    | "waste_spike"
    | "price_alert";

export interface AlertRecipient {
    userId?: string;
    email:   string;
    name?:   string;
    cc?:     boolean;
}

export interface SendAlertParams {
    type:          NotificationType;
    dedupeKey:     string;
    subject:       string;
    react:         React.ReactElement;
    recipients:    AlertRecipient[];
    storageAreaId?: string;
    ingredientId?:  string;
}

export interface SendAlertResult {
    sent:    number;
    skipped: number;
    failed:  number;
    logIds:  string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

/** Convert React Email JSX → html + plain text. */
async function renderTemplate(node: React.ReactElement): Promise<{ html: string; text: string }> {
    const html = await render(node);
    const text = await render(node, { plainText: true });
    return { html, text };
}

export async function sendAlert(p: SendAlertParams): Promise<SendAlertResult> {
    if (p.recipients.length === 0) {
        return { sent: 0, skipped: 0, failed: 0, logIds: [] };
    }

    // 1. Dedupe — has *anything* with this key gone out already?
    const existing = await db.notificationLog.findUnique({ where: { dedupeKey: p.dedupeKey } });
    if (existing && existing.status === "sent") {
        return { sent: 0, skipped: p.recipients.length, failed: 0, logIds: [existing.id] };
    }

    // 2. Render once
    const { html, text } = await renderTemplate(p.react);

    // 3. Group To vs Cc, single send to keep delivery cheap
    const to  = p.recipients.filter(r => !r.cc).map(r => r.email);
    const cc  = p.recipients.filter(r =>  r.cc).map(r => r.email);

    let status: "sent" | "failed" | "skipped" = "sent";
    let errorMsg: string | undefined;

    if (to.length === 0 && cc.length === 0) {
        status = "skipped";
        errorMsg = "no recipients";
    } else {
        const res = await sendEmail({
            to:      to.length > 0 ? to : cc, // cc-only edge case: promote to To
            cc:      to.length > 0 ? cc : undefined,
            subject: p.subject,
            html,
            text,
        });
        if (res.skipped) { status = "skipped"; errorMsg = res.error; }
        else if (!res.ok) { status = "failed";  errorMsg = res.error; }
    }

    // 4. Log per recipient (so admin page can show full audit)
    const logRows = await Promise.all(p.recipients.map((r, i) =>
        db.notificationLog.create({
            data: {
                type:          p.type,
                storageAreaId: p.storageAreaId ?? null,
                ingredientId:  p.ingredientId  ?? null,
                userId:        r.userId        ?? null,
                email:         r.email,
                subject:       p.subject,
                status,
                errorMsg:      errorMsg ?? null,
                // First recipient gets the canonical dedupeKey; others suffixed so unique constraint holds.
                dedupeKey:     i === 0 ? p.dedupeKey : `${p.dedupeKey}#${r.email}`,
                sentAt:        status === "sent" ? new Date() : null,
            },
            select: { id: true },
        })
    ));

    return {
        sent:    status === "sent"    ? p.recipients.length : 0,
        skipped: status === "skipped" ? p.recipients.length : 0,
        failed:  status === "failed"  ? p.recipients.length : 0,
        logIds:  logRows.map(r => r.id),
    };
}

/** Helper: build today's YYYY-MM-DD in Asia/Bangkok for dedupe keys. */
export function bkkDateKey(d: Date = new Date()): string {
    // Asia/Bangkok = UTC+7, no DST
    const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
    const bkk = new Date(utc + 7 * 3600_000);
    return bkk.toISOString().slice(0, 10);
}
