/**
 * GET /api/reports/usage?days=7   (in-app, session-authenticated)
 * Last-N-day usage from PMIX — see lib/usage-report.ts for the aggregation.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildUsageReport } from "@/lib/usage-report";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sp = new URL(req.url).searchParams;
    const days = Number(sp.get("days") ?? 7);
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const range = from ? { from, to } : undefined;
    return NextResponse.json(await buildUsageReport(days, range));
}
