/**
 * GET /api/reports/usage?days=7   (in-app, session-authenticated)
 * Last-N-day usage from PMIX — see lib/usage-report.ts for the aggregation.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { buildUsageReport } from "@/lib/usage-report";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;

    const sp = new URL(req.url).searchParams;
    const days = Number(sp.get("days") ?? 7);
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const range = from ? { from, to } : undefined;
    return NextResponse.json(await buildUsageReport(ctx.branchId, days, range));
}
