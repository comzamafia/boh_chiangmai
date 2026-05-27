/**
 * GET /api/pmix/analytics/protein-daily
 *   ?protein=Lobster          — exact label as it appears in MainProtein byType
 *   &from=YYYY-MM-DD
 *   &to=YYYY-MM-DD
 *
 * Returns per-day quantity + usage for one protein across the date range.
 * Uses the same hybrid classifier logic as the range API.
 *
 * Response:
 *   { protein, portionSize, portionUnit, ingredientName,
 *     days: { date, qty, totalUsed, lb }[] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const protein = searchParams.get("protein");
    const fromStr = searchParams.get("from");
    const toStr   = searchParams.get("to");

    if (!protein || !fromStr || !toStr) {
        return NextResponse.json({ error: "protein, from, and to are required" }, { status: 400 });
    }

    const fromDate = new Date(fromStr + "T00:00:00.000Z");
    const toDate   = new Date(toStr   + "T23:59:59.999Z");
    if (isNaN(fromDate.getTime()) || isNaN(toDate.getTime())) {
        return NextResponse.json({ error: "Invalid date format" }, { status: 400 });
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Uploads in range
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: fromDate, lte: toDate } },
                { businessDate: null, uploadedAt: { gte: fromDate, lte: toDate } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
        orderBy: [{ businessDate: "asc" }, { uploadedAt: "asc" }],
    });

    if (uploads.length === 0) {
        return NextResponse.json({ protein, portionSize: null, portionUnit: null, ingredientName: null, days: [] });
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 2. Map upload → date
    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        uploadDateMap.set(u.id as string, date);
    }

    // 3. Items + modifiers
    const items = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds } },
        include: { modifiers: true },
    });

    // 4. Item rules
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 5. Portion standard for this protein
    const stdRow = await db.portionStandard.findFirst({
        where: {
            itemName: { equals: protein, mode: "insensitive" },
            type:     { in: ["modifier", "base"] },
        },
        include: { ingredient: { select: { id: true, name: true } } },
    });
    const portionSize: number | null     = stdRow ? Number(stdRow.portionSize)  : null;
    const portionUnit: string | null     = stdRow ? stdRow.portionUnit           : null;
    const ingredientName: string | null  = stdRow?.ingredient?.name ?? stdRow?.itemName ?? null;

    // 6. Accumulate per-day qty
    const dayQty = new Map<string, number>();

    for (const item of items) {
        const dishName = item.itemName as string;
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0) continue;
        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        if (hasProteinModifier(mods)) {
            // Modifier-based path
            for (const mod of mods) {
                const grp    = (mod.modifierGroup ?? "").toLowerCase();
                const name   = (mod.modifier ?? "").trim();
                const modQty = Number(mod.qtySold ?? 0);
                if (!name || modQty === 0) continue;

                const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
                const isMain  = grp.includes("protein") && !isExtra;
                if (!isMain) continue;

                const modClass = classifyItem(name, rules);
                if (modClass?.category === "excluded") continue;

                // Match this modifier name against the requested protein label
                // Protein label is the modifier name as stored (exact match)
                if (name !== protein) continue;

                dayQty.set(date, (dayQty.get(date) ?? 0) + modQty);
            }
        } else {
            // Item-rule path
            const result = classifyItem(dishName, rules);
            if (!result) continue;
            if (result.category !== "main_protein") continue;
            if (result.label !== protein) continue;

            dayQty.set(date, (dayQty.get(date) ?? 0) + qty);
        }
    }

    // 7. Build day array (only days with data)
    const days = [...dayQty.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, qty]) => {
            const totalUsed = portionSize !== null ? qty * portionSize : null;
            const lb        = totalUsed !== null && portionUnit === "oz" ? +(totalUsed / 16).toFixed(3) : null;
            return { date, qty, totalUsed, lb };
        });

    return NextResponse.json({ protein, portionSize, portionUnit, ingredientName, days });
}
