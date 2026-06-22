/**
 * GET /api/reports/protein-usage?days=7   (in-app, session-authenticated)
 * Main Protein tab — ingredient roll-up folded into protein display groups.
 * See lib/protein-report.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildProteinReport } from "@/lib/protein-report";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
    return NextResponse.json(await buildProteinReport(days));
}
