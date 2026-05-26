/**
 * Vercel Cron — weekly inventory digest.
 * Schedule:  0 1 * * 1  (UTC) → Mon 08:00 Asia/Bangkok
 */
import { NextRequest, NextResponse } from "next/server";
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
    const summary = await runDailyDigest({ cadence: "weekly" });
    return NextResponse.json({ ok: true, cadence: "weekly", ...summary });
}

export async function POST(req: NextRequest) {
    return GET(req);
}
