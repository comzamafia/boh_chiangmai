/**
 * Public Usage Report API (for external systems) — API-key authenticated.
 *
 *   GET /api/public/usage-report?days=7
 *   Auth (any one):
 *     - Header:  x-api-key: <key>
 *     - Header:  Authorization: Bearer <key>
 *     - Query:   ?key=<key>   (avoid in shared logs; prefer a header)
 *
 * Configure the key(s) in env USAGE_REPORT_API_KEY (comma-separated for many).
 * Returns the same data as the in-app Usage Report (Mon..Sun usage per item,
 * with ingredient + unit-chain info), wrapped with metadata. CORS-enabled.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildUsageReport } from "@/lib/usage-report";

export const dynamic = "force-dynamic";

const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

function presentedKey(req: NextRequest): string | null {
    const h = req.headers;
    const xkey = h.get("x-api-key");
    if (xkey) return xkey.trim();
    const auth = h.get("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    return new URL(req.url).searchParams.get("key");
}

export async function GET(req: NextRequest) {
    const configured = (process.env.USAGE_REPORT_API_KEY ?? "")
        .split(",").map(k => k.trim()).filter(Boolean);
    if (configured.length === 0) {
        return NextResponse.json({ error: "API not configured. Set USAGE_REPORT_API_KEY." }, { status: 503, headers: CORS });
    }
    const key = presentedKey(req);
    if (!key || !configured.includes(key)) {
        return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401, headers: CORS });
    }

    const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
    try {
        const data = await buildUsageReport(days);
        return NextResponse.json(
            { ok: true, source: "sujeevan-boh", generatedAt: new Date().toISOString(), ...data },
            { headers: { ...CORS, "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build report" }, { status: 500, headers: CORS });
    }
}
