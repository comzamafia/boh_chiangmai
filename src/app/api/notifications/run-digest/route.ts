/**
 * POST /api/notifications/run-digest?cadence=daily|weekly
 * Admin-triggered manual digest run.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runDailyDigest } from "@/lib/notifications/triggers/daily-digest";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cadence = (req.nextUrl.searchParams.get("cadence") ?? "daily") as "daily" | "weekly";
    const summary = await runDailyDigest({ cadence });
    return NextResponse.json(summary);
}
