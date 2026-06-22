/**
 * Public Ingredient-Usage API (for external systems) — API-key authenticated.
 *
 *   GET /api/public/ingredient-usage?days=7[&proteinOnly=1]
 *   Auth (any one):
 *     - Header:  x-api-key: <key>
 *     - Header:  Authorization: Bearer <key>
 *     - Query:   ?key=<key>   (avoid in shared logs; prefer a header)
 *
 * Returns the last-N-day usage rolled up to the INGREDIENT level — each
 * ingredient summed across every dish, modifier, add-on, and composite
 * sub-recipe it appears in (same figures as the in-app Ingredients tab and the
 * Main Protein tab). Pass proteinOnly=1 to get just the proteins.
 *
 * Configure the key(s) in env INGREDIENT_USAGE_API_KEY (or the shared
 * PUBLIC_API_KEY); comma-separated for many. CORS-enabled.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildIngredientUsage } from "@/lib/ingredient-usage";
import { authPublicRequest, branchIdentity, CORS } from "@/lib/public-api";

export const dynamic = "force-dynamic";

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
    const denied = authPublicRequest(req, ["INGREDIENT_USAGE_API_KEY"]);
    if (denied) return denied;

    const url = new URL(req.url);
    const days = Number(url.searchParams.get("days") ?? 7);
    const proteinOnly = /^(1|true|yes)$/i.test(url.searchParams.get("proteinOnly") ?? "");
    try {
        const data = await buildIngredientUsage(days);
        const ingredients = proteinOnly ? data.ingredients.filter(i => i.isProtein) : data.ingredients;
        return NextResponse.json(
            { ok: true, source: "sujeevan-boh", branch: branchIdentity(), generatedAt: new Date().toISOString(),
              days: data.days, dowCounts: data.dowCounts, proteinOnly, ingredients },
            { headers: { ...CORS, "Cache-Control": "no-store" } },
        );
    } catch (e) {
        return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build report" }, { status: 500, headers: CORS });
    }
}
