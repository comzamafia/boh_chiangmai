/**
 * Public Server-Performance API (for external report systems) — key-authed.
 *
 *   GET /api/public/server-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
 *   Auth: x-api-key | Authorization: Bearer <key> | ?key=<key>
 *         Configure SERVER_PERF_API_KEY (or PUBLIC_API_KEY) — comma-separated
 *         for multiple keys.
 *
 * Multi-branch: each branch is a separate deployment with its own URL + DB +
 * key. Call each branch's own URL; the `branch` block in the response says
 * which one produced the data so the consumer can merge branches into one
 * report. Adding a future branch needs no change here.
 *
 * `from` defaults to `to`; `to` defaults to today (UTC). Max range 366 days.
 * CORS-enabled, never cached.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildServerPerformance } from "@/lib/server-performance";
import { authPublicRequest, branchIdentity, CORS } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS  = 86_400_000;

export async function GET(req: NextRequest) {
    const denied = authPublicRequest(req, ["SERVER_PERF_API_KEY"]);
    if (denied) return denied;

    const sp    = new URL(req.url).searchParams;
    const toStr = sp.get("to") ?? new Date().toISOString().slice(0, 10);
    const fromStr = sp.get("from") ?? toStr;

    if (!DATE_RE.test(fromStr) || !DATE_RE.test(toStr)) {
        return NextResponse.json({ error: "from/to must be YYYY-MM-DD." }, { status: 400, headers: CORS });
    }
    const fromMs = Date.parse(fromStr + "T00:00:00Z");
    const toMs   = Date.parse(toStr   + "T00:00:00Z");
    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || fromMs > toMs) {
        return NextResponse.json({ error: "Invalid range: from must be <= to." }, { status: 400, headers: CORS });
    }
    if ((toMs - fromMs) / DAY_MS > 366) {
        return NextResponse.json({ error: "Range too large (max 366 days)." }, { status: 400, headers: CORS });
    }

    try {
        const data = await buildServerPerformance(fromStr, toStr);
        return NextResponse.json(
            { ok: true, branch: branchIdentity(), generatedAt: new Date().toISOString(), ...data },
            { headers: { ...CORS, "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return NextResponse.json(
            { error: e instanceof Error ? e.message : "Failed to build server performance report" },
            { status: 500, headers: CORS },
        );
    }
}
