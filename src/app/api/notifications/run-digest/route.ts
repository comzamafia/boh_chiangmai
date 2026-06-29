/**
 * POST /api/notifications/run-digest?cadence=daily|weekly
 * Admin-triggered manual digest run.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { runDailyDigest } from "@/lib/notifications/triggers/daily-digest";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin" && session.role !== "manager") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const cadence = (req.nextUrl.searchParams.get("cadence") ?? "daily") as "daily" | "weekly";
    const summary = await runDailyDigest({ cadence, branchId });
    return NextResponse.json(summary);
}
