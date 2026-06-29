/**
 * POST /api/pmix/auto-fill-portions (v2)
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
 *   createMissingIngredients?: boolean       // default false
 * }
 *
 * Ingredient matching strategy (in order):
 *   1. Exact name match
 *   2. Strip "Extra " prefix → exact match
 *   3. Partial match: protein name is contained in ingredient name (e.g. "Chicken" → "Chicken Breast")
 *   4. Reverse partial: ingredient name contained in protein name
 *   5. If createMissingIngredients=true → create a placeholder ingredient
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { logAudit } from "@/lib/audit";

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const uploadId    = body.uploadId as string;
    const portionSize = Number(body.portionSize ?? 6);
    const portionUnit = (body.portionUnit ?? "oz") as string;
    const scope       = (body.scope ?? "main") as "main" | "extra" | "both";
    const createMissingIngredients = body.createMissingIngredients === true;

    if (!uploadId)          return NextResponse.json({ error: "uploadId is required" }, { status: 400 });
    if (!(portionSize > 0)) return NextResponse.json({ error: "portionSize must be > 0" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Load PMIX items with modifiers
    const pmixItems = await db.pmixItem.findMany({
        where: { uploadId, branchId },
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
        where: { branchId },
        select: { id: true, name: true },
    });
    const ingByName = new Map<string, { id: string; name: string }>();
    for (const ing of ingredients) {
        ingByName.set(ing.name.toLowerCase().trim(), ing);
    }

    // Also load existing portion standards to avoid duplicates
    const existing = await prisma.portionStandard.findMany({
        where: { branchId },
        select: { ingredientId: true, itemName: true },
    });
    const existingKeys = new Set(
        existing.map(e => `${e.ingredientId}|${e.itemName.toLowerCase().trim()}`)
    );

    // Helper: find an ingredient by name with progressive fallbacks
    function findIngredient(proteinName: string): { id: string; name: string } | null {
        const norm  = proteinName.toLowerCase().trim();
        // 1. Exact
        const exact = ingByName.get(norm);
        if (exact) return exact;
        // 2. Strip "Extra " prefix
        if (norm.startsWith("extra ")) {
            const stripped = ingByName.get(norm.replace(/^extra\s+/, ""));
            if (stripped) return stripped;
        }
        // 3. Partial: protein name appears as a whole word in an ingredient name
        const tokens = norm.split(/\s+/).filter(t => t.length > 2);
        for (const ing of ingredients) {
            const ingNorm = ing.name.toLowerCase();
            if (ingNorm.includes(norm)) return ing;
            // 4. Reverse partial: ingredient name appears in protein name
            if (norm.includes(ingNorm) && ingNorm.length > 2) return ing;
            // 5. Token match: any meaningful token shared
            for (const t of tokens) {
                if (new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(ingNorm)) {
                    return ing;
                }
            }
        }
        return null;
    }

    // For auto-create: need a default supplier
    let defaultSupplierId: string | null = null;
    if (createMissingIngredients) {
        const anySupplier = await prisma.supplier.findFirst({ where: { branchId }, select: { id: true } });
        defaultSupplierId = anySupplier?.id ?? null;
    }

    // 4. For each protein name, try to find ingredient + create standard
    const created:           { ingredientName: string; itemName: string }[] = [];
    const ingredientsCreated: string[] = [];
    const skippedExisting:   string[] = [];
    const missingIngredients: string[] = [];

    for (const proteinName of proteinNames) {
        let ingMatch = findIngredient(proteinName);

        // Auto-create ingredient if requested and not found
        if (!ingMatch && createMissingIngredients && defaultSupplierId) {
            const newIng = await prisma.ingredient.create({
                data: {
                    name:           proteinName,
                    supplierId:     defaultSupplierId,
                    purchaseUnit:   "kg",
                    purchasePrice:  0,
                    recipeUnit:     portionUnit,   // use the same unit as the portion (e.g. "oz")
                    yieldPercent:   100,
                    conversionRate: 1,
                    groupId:        "Weight",
                    branchId,
                },
                select: { id: true, name: true },
            });
            ingMatch = newIng;
            ingredientsCreated.push(newIng.name);
            // Keep our in-memory lookup current for subsequent loop iterations
            ingredients.push(newIng);
            ingByName.set(newIng.name.toLowerCase().trim(), newIng);
            logAudit({
                session,
                action:      "CREATE",
                targetTable: "Ingredient",
                targetId:    newIng.id,
                targetName:  `${newIng.name} (placeholder via PMIX auto-fill)`,
                newValues:   { name: newIng.name, supplierId: defaultSupplierId },
                branchId,
            });
        }

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
                branchId,
            },
            include: { ingredient: { select: { name: true } } },
        });

        created.push({ ingredientName: row.ingredient.name, itemName: row.itemName });
        existingKeys.add(key);

        logAudit({
            session,
            action:      "CREATE",
            targetTable: "PortionStandard",
            targetId:    row.id,
            targetName:  `${row.ingredient.name} — ${row.itemName} (auto-fill)`,
            newValues:   { portionSize, portionUnit, type: "modifier" },
            branchId,
        });
    }

    return NextResponse.json({
        created:             created.length,
        createdDetails:      created,
        ingredientsCreated,
        skippedExisting:     skippedExisting.length,
        skippedDetails:      skippedExisting,
        missingIngredients,
        portionSize,
        portionUnit,
    });
}
