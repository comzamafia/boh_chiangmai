/**
 * GET /api/server-perf/dashboard?from&to  (Admin only)
 * Aggregates server-sales rows per staff member and computes multi-dimensional
 * KPIs + a weighted Performance Score for an executive leaderboard.
 *
 * Computation lives in lib/server-performance.ts so the public report API
 * (/api/public/server-performance) returns identical numbers.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { buildServerPerformance } from "@/lib/server-performance";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session } = ctx;
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const toStr = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    const fromStr = sp.get("from") ?? toStr;

    // NOTE: buildServerPerformance (src/lib/server-performance.ts) queries
    // serverSalesRow / serverSalesUpload WITHOUT a branchId filter. Until that
    // shared lib accepts a branchId, this dashboard is NOT branch-scoped.
    const data = await buildServerPerformance(fromStr, toStr);
    return NextResponse.json(data);
}
