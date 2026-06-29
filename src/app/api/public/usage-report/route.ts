/**
 * Public Usage Report API (for external systems) — API-key authenticated.
 *
 *   GET /api/public/usage-report?days=7
 *   Auth (any one):
 *     - Header:  x-api-key: <key>
 *     - Header:  Authorization: Bearer <key>
 *     - Query:   ?key=<key>   (avoid in shared logs; prefer a header)
 *
 * Configure the key(s) in env USAGE_REPORT_API_KEY (or the shared
 * PUBLIC_API_KEY); comma-separated for many. Returns the same data as the
 * in-app Usage Report (Mon..Sun usage per item, with ingredient + unit-chain
 * info), wrapped with branch identity. CORS-enabled.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildUsageReport } from "@/lib/usage-report";
import { authPublicRequest, branchIdentity, resolvePublicBranch, CORS } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
    const denied = authPublicRequest(req, ["USAGE_REPORT_API_KEY"]);
    if (denied) return denied;

    const branch = await resolvePublicBranch(req);
    if (branch instanceof NextResponse) return branch;

    const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
    try {
        const data = await buildUsageReport(branch.branchId, days);
        return NextResponse.json(
            { ok: true, source: "sujeevan-boh", branch: branchIdentity(branch), generatedAt: new Date().toISOString(), ...data },
            { headers: { ...CORS, "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build report" }, { status: 500, headers: CORS });
    }
}
