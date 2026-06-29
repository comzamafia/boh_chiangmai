/**
 * Vercel Cron — weekly inventory digest.
 * Schedule:  0 11 * * 1  (UTC) → Mon 07:00 America/Toronto (EDT) / 06:00 EST
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDailyDigest } from "@/lib/notifications/triggers/daily-digest";

export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
    if (req.headers.get("x-vercel-cron")) return true;
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const results = [];
    for (const b of branches) {
        const summary = await runDailyDigest({ cadence: "weekly", branchId: b.id });
        results.push({ branch: b.slug, ...summary });
    }
    return NextResponse.json({ ok: true, cadence: "weekly", branches: results });
}

export async function POST(req: NextRequest) {
    return GET(req);
}
