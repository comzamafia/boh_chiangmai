/**
 * public-api.ts
 *
 * Shared helpers for the API-key-authenticated public endpoints under
 * /api/public/*. These are called by external report systems, once per branch
 * (Option A = one deployment + DB + URL per branch), so every response also
 * self-identifies which branch produced it.
 *
 * Auth: a request must present a key matching one configured in this branch's
 * env. A single PUBLIC_API_KEY works for every public endpoint; endpoint-
 * specific keys are also accepted for finer-grained rotation.
 *
 *   Header:  x-api-key: <key>
 *   Header:  Authorization: Bearer <key>
 *   Query:   ?key=<key>            (prefer a header; query strings get logged)
 */
import { NextRequest, NextResponse } from "next/server";
import { STORE_ID, STORE_NAME, STORE_SHORT } from "@/lib/branding";

export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

/** Identifies the branch that served this response. */
export function branchIdentity() {
    return {
        id:    STORE_ID,
        name:  STORE_NAME,
        short: STORE_SHORT,
        url:   (process.env.APP_URL ?? "").trim() || null,
    };
}

function presentedKey(req: NextRequest): string | null {
    const h = req.headers;
    const xkey = h.get("x-api-key");
    if (xkey) return xkey.trim();
    const auth = h.get("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    return new URL(req.url).searchParams.get("key");
}

/**
 * Authenticate a public request against the given env var names (checked in
 * order) plus the catch-all PUBLIC_API_KEY. Each var may hold a comma-separated
 * list of keys. Returns null when authorised, or a ready-to-return error
 * NextResponse (with CORS) when not.
 */
export function authPublicRequest(req: NextRequest, envNames: string[]): NextResponse | null {
    const names = [...envNames, "PUBLIC_API_KEY"];
    const configured = names
        .flatMap(n => (process.env[n] ?? "").split(","))
        .map(k => k.trim())
        .filter(Boolean);

    if (configured.length === 0) {
        return NextResponse.json(
            { error: `API not configured. Set one of: ${names.join(", ")}.` },
            { status: 503, headers: CORS },
        );
    }
    const key = presentedKey(req);
    if (!key || !configured.includes(key)) {
        return NextResponse.json({ error: "Invalid or missing API key." }, { status: 401, headers: CORS });
    }
    return null; // authorised
}
