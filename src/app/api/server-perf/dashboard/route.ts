/**
 * GET /api/server-perf/dashboard?from&to  (Admin only)
 * Aggregates server-sales rows per staff member and computes multi-dimensional
 * KPIs + a weighted Performance Score for an executive leaderboard.
 *
 * Computation lives in lib/server-performance.ts so the public report API
 * (/api/public/server-performance) returns identical numbers.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildServerPerformance } from "@/lib/server-performance";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const toStr = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    const fromStr = sp.get("from") ?? toStr;

    const data = await buildServerPerformance(fromStr, toStr);
    return NextResponse.json(data);
}
