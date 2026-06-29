/**
 * Vercel Cron — order-due reminders.
 * Schedule:  0 10 * * *   (UTC) → 06:00 EDT / 05:00 EST Toronto
 *   Runs early so it catches same-day-cutoff suppliers before their cutoff.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runOrderReminders } from "@/lib/notifications/triggers/order-reminder";

export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
    if (req.headers.get("x-vercel-cron")) return true;
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    // 14h window — covers same-day (cutoff 5PM) and tomorrow's morning cutoffs
    const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const results = [];
    for (const b of branches) {
        const summary = await runOrderReminders({ windowHours: 14, branchId: b.id });
        results.push({ branch: b.slug, ...summary });
    }
    return NextResponse.json({ ok: true, branches: results });
}

export async function POST(req: NextRequest) {
    return GET(req);
}
