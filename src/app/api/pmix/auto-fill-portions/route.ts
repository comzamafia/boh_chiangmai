/**
 * POST /api/pmix/auto-fill-portions
 *
 * Bulk-creates Portion Standards for all protein modifiers detected in a
 * PMIX upload. Each modifier name (e.g. "Chicken", "Beef") is matched to an
 * existing Ingredient by case-insensitive name. Skips proteins where no
 * matching ingredient exists OR where a portion standard already exists.
 *
 * Body: {
 *   uploadId:    string,
 *   portionSize: number,        // default 6
 *   portionUnit: string,        // default "oz"
 *   scope:       "main" | "extra" | "both"   // default "main"
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uploadId    = body.uploadId as string;
    const portionSize = Number(body.portionSize ?? 6);
    const portionUnit = (body.portionUnit ?? "oz") as string;
    const scope       = (body.scope ?? "main") as "main" | "extra" | "both";

    if (!uploadId)          return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    if (!(portionSize > 0)) return NextResponse.json({ error: "portionSize must be > 0" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Load PMIX items with modifiers
    const pmixItems = await db.pmixItem.findMany({
        where: { uploadId },
        include: { modifiers: true },
    });
    if (pmixItems.length === 0) {
        return NextResponse.json({ error: "Upload has no items" }, { status: 404 });
    }

    // 2. Collect unique modifier names per scope
    const proteinNames = new Set<string>();
    for (const item of pmixItems) {
        for (const mod of item.modifiers as Array<{ modifierGroup: string; modifier: string }>) {
            const grp     = (mod.modifierGroup ?? "").toLowerCase();
            const name    = (mod.modifier ?? "").trim();
            if (!name) continue;
            const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
            const isMain  = grp.includes("protein") && !isExtra;
            if (scope === "main"  && isMain)  proteinNames.add(name);
            if (scope === "extra" && isExtra) proteinNames.add(name);
            if (scope === "both"  && (isMain || isExtra)) proteinNames.add(name);
        }
    }

    if (proteinNames.size === 0) {
        return NextResponse.json({
            created: 0, skippedExisting: 0, missingIngredients: [],
            message: "No protein modifiers found in this upload",
        });
    }

    // 3. Load all ingredients (case-insensitive name lookup)
    const ingredients = await prisma.ingredient.findMany({
        select: { id: true, name: true },
    });
    const ingByName = new Map<string, { id: string; name: string }>();
    for (const ing of ingredients) {
        ingByName.set(ing.name.toLowerCase().trim(), ing);
    }

    // Also load existing portion standards to avoid duplicates
    const existing = await prisma.portionStandard.findMany({
        select: { ingredientId: true, itemName: true },
    });
    const existingKeys = new Set(
        existing.map(e => `${e.ingredientId}|${e.itemName.toLowerCase().trim()}`)
    );

    // 4. For each protein name, try to find ingredient + create standard
    const created:           { ingredientName: string; itemName: string }[] = [];
    const skippedExisting:   string[] = [];
    const missingIngredients: string[] = [];

    for (const proteinName of proteinNames) {
        const ingMatch = ingByName.get(proteinName.toLowerCase().trim())
            // Try without "Extra " prefix for extras
            ?? (proteinName.toLowerCase().startsWith("extra ")
                ? ingByName.get(proteinName.toLowerCase().trim().replace(/^extra\s+/, ""))
                : undefined);

        if (!ingMatch) {
            missingIngredients.push(proteinName);
            continue;
        }

        const key = `${ingMatch.id}|${proteinName.toLowerCase().trim()}`;
        if (existingKeys.has(key)) {
            skippedExisting.push(proteinName);
            continue;
        }

        const row = await prisma.portionStandard.create({
            data: {
                ingredientId: ingMatch.id,
                itemName:     proteinName,
                type:         "modifier",
                portionSize:  portionSize,
                portionUnit:  portionUnit,
            },
            include: { ingredient: { select: { name: true } } },
        });

        created.push({ ingredientName: row.ingredient.name, itemName: row.itemName });

        logAudit({
            session,
            action:      "CREATE",
            targetTable: "PortionStandard",
            targetId:    row.id,
            targetName:  `${row.ingredient.name} — ${row.itemName} (auto-fill)`,
            newValues:   { portionSize, portionUnit, type: "modifier" },
        });
    }

    return NextResponse.json({
        created:            created.length,
        createdDetails:     created,
        skippedExisting:    skippedExisting.length,
        skippedDetails:     skippedExisting,
        missingIngredients,
        portionSize,
        portionUnit,
    });
}
