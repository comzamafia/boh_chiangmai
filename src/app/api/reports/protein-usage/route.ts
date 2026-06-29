/**
 * GET /api/reports/protein-usage?days=7   (in-app, session-authenticated)
 * Main Protein tab — ingredient roll-up folded into protein display groups.
 * See lib/protein-report.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { buildProteinReport } from "@/lib/protein-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const sp = new URL(req.url).searchParams;
    const days = Number(sp.get("days") ?? 7);
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const range = from ? { from, to } : undefined;
    return NextResponse.json(await buildProteinReport(ctx.branchId, days, range));
}
