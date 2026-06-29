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
import { prisma } from "@/lib/db";

export const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, x-api-key",
};

/** Identifies the branch that served this response. */
export function branchIdentity(branch?: { slug: string; name: string } | null) {
    if (branch) {
        return {
            id:    branch.slug,
            name:  branch.name,
            short: branch.slug,
            url:   (process.env.APP_URL ?? "").trim() || null,
        };
    }
    return {
        id:    STORE_ID,
        name:  STORE_NAME,
        short: STORE_SHORT,
        url:   (process.env.APP_URL ?? "").trim() || null,
    };
}

export interface PublicBranch { branchId: string; slug: string; name: string }

/**
 * Resolve which branch a public request targets. The caller selects a branch via
 * `?branch=<slug>` or the `x-branch` header. With exactly one active branch, that
 * branch is used as the default when none is specified (keeps single-branch
 * deployments working). Returns the resolved branch, or a ready-to-return error.
 */
export async function resolvePublicBranch(req: NextRequest): Promise<PublicBranch | NextResponse> {
    const slug = (req.headers.get("x-branch") ?? new URL(req.url).searchParams.get("branch") ?? "").trim();

    if (slug) {
        const branch = await prisma.branch.findFirst({ where: { slug, isActive: true }, select: { id: true, slug: true, name: true } });
        if (!branch) {
            return NextResponse.json({ error: `Unknown or inactive branch "${slug}".` }, { status: 404, headers: CORS });
        }
        return { branchId: branch.id, slug: branch.slug, name: branch.name };
    }

    // No branch specified — fall back only if there's exactly one active branch.
    const active = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true }, take: 2 });
    if (active.length === 1) {
        return { branchId: active[0].id, slug: active[0].slug, name: active[0].name };
    }
    return NextResponse.json(
        { error: "Multiple branches exist; specify one via ?branch=<slug> or the x-branch header." },
        { status: 400, headers: CORS },
    );
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
