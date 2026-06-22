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

    const days = Number(new URL(req.url).searchParams.get("days") ?? 7);
    return NextResponse.json(await buildIngredientUsage(days));
}
