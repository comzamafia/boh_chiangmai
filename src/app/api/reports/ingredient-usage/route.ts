/**
 * GET /api/reports/ingredient-usage?days=7   (in-app, session-authenticated)
 * Ingredient-level roll-up of PMIX usage — see lib/ingredient-usage.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { buildIngredientUsage } from "@/lib/ingredient-usage";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const sp = new URL(req.url).searchParams;
    const days = Number(sp.get("days") ?? 7);
    const from = sp.get("from") ?? undefined;
    const to = sp.get("to") ?? undefined;
    const range = from ? { from, to } : undefined;
    return NextResponse.json(await buildIngredientUsage(days, range));
}
