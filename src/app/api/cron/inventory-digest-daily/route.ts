/**
 * Vercel Cron entry point — daily inventory digest.
 *
 * Schedule (configure in vercel.json):  0 11 * * *   (UTC) → 07:00 America/Toronto (EDT) / 06:00 EST
 *
 * Auth: Vercel cron sets header `x-vercel-cron: 1`. We additionally accept
 *       a bearer CRON_SECRET so manual runs from `curl` are possible.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runDailyDigest } from "@/lib/notifications/triggers/daily-digest";

export const maxDuration = 60;

function authorize(req: NextRequest): boolean {
    if (req.headers.get("x-vercel-cron")) return true;
    const secret = process.env.CRON_SECRET;
    if (!secret) return true; // fall through if not configured (dev)
    const auth = req.headers.get("authorization") ?? "";
    return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const results = [];
    for (const b of branches) {
        const summary = await runDailyDigest({ cadence: "daily", branchId: b.id });
        results.push({ branch: b.slug, ...summary });
    }
    return NextResponse.json({ ok: true, cadence: "daily", branches: results });
}

export async function POST(req: NextRequest) {
    return GET(req);
}
