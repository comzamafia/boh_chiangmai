/**
 * GET  /api/inventory/par-suggestions?days=7
 *   Compute Average Daily Usage (ADU) and suggest PAR Min, ROP, and PAR Max.
 *
 *   Usage source — picks the best available signal per ingredient:
 *     1. InventoryTransaction "Out" records (preferred — actual prep/depletion)
 *     2. PMIX Main Protein / Main Dessert totals × Portion Standard
 *        (fallback when no inventory transactions exist — uses real sales data)
 *
 * POST /api/inventory/par-suggestions
 *   Apply selected suggestions to InventoryItem records.
 *   Body: { items: [{ inventoryItemId, parMin, parMax, reorderPoint }] }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { calculateLeadTime } from "@/lib/supplier-lead-time";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";

// PAR suggestions are recomputed live from PMIX uploads + InventoryTransaction —
// never serve a cached response.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(90, Number(searchParams.get("days") ?? 7)));

    // Date window
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const cutoffStr = cutoff.toISOString().slice(0, 10); // YYYY-MM-DD

    // Load all inventory items with ingredient details + supplier schedule
    const inventoryItems = await prisma.inventoryItem.findMany({
        include: {
            ingredient: {
                select: {
                    id: true,
                    name: true,
                    sku: true,
                    recipeUnit: true,
                    groupId: true,
                    categoryId: true,
                    category: { select: { id: true, name: true } },
                    supplier: {
                        select: {
                            id: true,
                            name: true,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            deliveryDays:         true as any,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            orderCutoffTime:      true as any,
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            orderCutoffDayOffset: true as any,
                        },
                    },
                },
            },
        },
        orderBy: { ingredient: { name: "asc" } },
    });

    // Load "Out" transactions within the window for all tracked ingredients
    const ingredientIds = inventoryItems.map(iv => iv.ingredientId);
    const outTxns = await prisma.inventoryTransaction.findMany({
        where: {
            ingredientId: { in: ingredientIds },
            type:         "Out",
            date:         { gte: cutoffStr },
        },
        select: { ingredientId: true, qty: true },
    });

    // Sum "Out" qty per ingredient
    const outMap = new Map<string, number>();
    for (const txn of outTxns) {
        outMap.set(txn.ingredientId, (outMap.get(txn.ingredientId) ?? 0) + Number(txn.qty));
    }

    // ─── PMIX-based usage fallback ───────────────────────────────────────────
    // Aggregate Main Protein and Main Dessert totals from PMIX uploads in the
    // same date window, mapped to inventory ingredients via PortionStandard.
    // Used when InventoryTransaction has no "Out" records for an ingredient.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const pmixUploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: cutoff } },
                { businessDate: null, uploadedAt: { gte: cutoff } },
            ],
        },
        select: { id: true },
    });
    const pmixUploadIds = pmixUploads.map((u: { id: string }) => u.id);

    // Map: ingredientId → total qty consumed (in recipe units) from PMIX
    const pmixUsageByIngId = new Map<string, number>();
    // Map: lowercase protein/item name → orders count (for fuzzy fallback)
    const pmixUsageByName  = new Map<string, number>();

    if (pmixUploadIds.length > 0) {
        const pmixItems = await db.pmixItem.findMany({
            where:   { uploadId: { in: pmixUploadIds } },
            include: { modifiers: true },
        });
        const rules: RuleRow[] = await db.pmixItemRule.findMany({
            where:   { isActive: true },
            orderBy: [{ priority: "desc" }, { pattern: "asc" }],
        });
        const standards = await db.portionStandard.findMany({
            where:   { type: { in: ["modifier", "base"] } },
            select:  { itemName: true, portionSize: true, ingredientId: true },
        });
        const stdByName = new Map<string, { ingredientId: string; portionSize: number }>();
        for (const s of standards) {
            stdByName.set(String(s.itemName).toLowerCase().trim(), {
                ingredientId: s.ingredientId,
                portionSize:  Number(s.portionSize),
            });
        }

        const addById   = (ingId: string, qty: number) => pmixUsageByIngId.set(ingId, (pmixUsageByIngId.get(ingId) ?? 0) + qty);
        const addByName = (name: string, qty: number) => {
            const k = name.toLowerCase().trim();
            if (k) pmixUsageByName.set(k, (pmixUsageByName.get(k) ?? 0) + qty);
        };

        for (const item of pmixItems) {
            const dishName = item.itemName as string;
            const qty      = Number(item.qtySold ?? 0);
            if (qty === 0) continue;

            const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

            if (hasProteinModifier(mods)) {
                // Modifier-based protein path
                for (const mod of mods) {
                    const grp    = (mod.modifierGroup ?? "").toLowerCase();
                    const name   = (mod.modifier ?? "").trim();
                    const modQty = Number(mod.qtySold ?? 0);
                    if (!name || modQty === 0) continue;
                    const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
                    const isMain  = grp.includes("protein") && !isExtra;
                    if (!isMain && !isExtra) continue;

                    const modClass = classifyItem(name, rules);
                    if (modClass?.category === "excluded") continue;

                    // Always record under name (raw orders) for fuzzy fallback.
                    addByName(name, modQty);
                    // If a Portion Standard exists, ALSO record the converted
                    // amount under the standard's ingredientId for exact matching.
                    const std = stdByName.get(name.toLowerCase().trim());
                    if (std) addById(std.ingredientId, modQty * std.portionSize);
                }
            } else {
                // Item-rule path (mostly desserts)
                const result = classifyItem(dishName, rules);
                if (!result || result.category === "excluded") continue;
                if (result.category === "dessert" || result.category === "main_protein" || result.category === "extra_protein") {
                    addByName(dishName, qty);
                    const std = stdByName.get(dishName.toLowerCase().trim());
                    if (std) addById(std.ingredientId, qty * std.portionSize);
                }
            }
        }
    }

    // Build suggestions
    const now = new Date();
    const suggestions = inventoryItems.map(iv => {
        // 1. Try InventoryTransaction "Out" records first
        let totalOut: number = outMap.get(iv.ingredientId) ?? 0;
        let usageSource: "transactions" | "pmix" | "none" = totalOut > 0 ? "transactions" : "none";

        // 2. Fall back to PMIX Main Protein / Main Dessert totals
        if (totalOut === 0) {
            const fromId = pmixUsageByIngId.get(iv.ingredientId) ?? 0;
            if (fromId > 0) {
                totalOut    = fromId;
                usageSource = "pmix";
            } else {
                // Last resort: fuzzy match by ingredient name (word-boundary aware
                // so "Chicken" matches "Chicken - Boneless Breast" but not
                // "Bbq Chicken Sauce").
                const ingName = iv.ingredient.name.toLowerCase().trim();
                const matches = (a: string, b: string) => {
                    if (a === b) return true;
                    // a is a prefix of b followed by a word separator
                    return b.startsWith(a + " ") || b.startsWith(a + "-") || b.startsWith(a + ",");
                };
                let best = 0;
                for (const [pmixName, qty] of pmixUsageByName.entries()) {
                    if (matches(pmixName, ingName) || matches(ingName, pmixName)) {
                        if (qty > best) best = qty;
                    }
                }
                if (best > 0) {
                    totalOut    = best;
                    usageSource = "pmix";
                }
            }
        }

        const adu = totalOut / days;  // Average Daily Usage in recipe units

        const currentParMin = Number(iv.parMin);
        const currentParMax = Number(iv.parMax);
        const currentROP    = Number(iv.reorderPoint);
        const flatLeadTime  = iv.leadTimeDays;
        const holdDays      = iv.holdingDays;

        // Compute effective lead time from supplier schedule if available
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sup = (iv.ingredient as any).supplier as
            | { id: string; name: string; deliveryDays: number[]; orderCutoffTime: string | null; orderCutoffDayOffset: number }
            | null
            | undefined;

        const lt = calculateLeadTime({
            deliveryDays:         sup?.deliveryDays ?? [],
            orderCutoffTime:      sup?.orderCutoffTime ?? null,
            orderCutoffDayOffset: sup?.orderCutoffDayOffset ?? 1,
            leadTimeFallback:     flatLeadTime,
        }, now);

        // PAR Min uses worst-case lead time (safety stock must cover the longest possible wait)
        // ROP = (ADU × lead time) + safety stock, where safety stock is the SUGGESTED PAR Min
        //       (using currentParMin would carry over stale manual values — e.g. an old 1000
        //       PAR Min would force ROP to always exceed 1000 regardless of actual usage)
        // PAR Max uses holdDays (how many days of stock to hold on hand)
        const r = (n: number) => Math.round(n * 100) / 100;
        const ltForSafety = Math.max(lt.worstCaseLeadDays, 1);
        const suggestedParMin = r(adu * Math.max(ltForSafety, 2));
        const suggestedROP    = r((adu * ltForSafety) + suggestedParMin);
        const suggestedParMax = r(adu * holdDays);

        const hasHistory = totalOut > 0;

        return {
            inventoryItemId:  iv.id,
            ingredientId:     iv.ingredientId,
            ingredientName:   iv.ingredient.name,
            sku:              iv.ingredient.sku,
            unit:             iv.ingredient.recipeUnit,
            groupId:          iv.ingredient.groupId,
            categoryId:       iv.ingredient.categoryId,
            categoryName:     iv.ingredient.category?.name ?? "Uncategorized",

            // History
            daysAnalyzed:     days,
            totalOutQty:      r(totalOut),
            adu:              r(adu),
            hasHistory,
            usageSource,     // "transactions" | "pmix" | "none"

            // Current limits
            currentParMin,
            currentParMax,
            currentROP,
            leadTimeDays:     flatLeadTime,
            holdingDays:      holdDays,
            currentStock:     Number(iv.currentStock),

            // Supplier-driven lead time
            supplierName:           sup?.name ?? null,
            scheduleBasedLeadDays:  lt.worstCaseLeadDays,
            scheduleEffectiveDays:  lt.effectiveLeadDays,
            scheduleFallback:       lt.fallback,
            nextDeliveryDate:       lt.nextDeliveryDate?.toISOString().slice(0, 10) ?? null,
            nextOrderBy:            lt.nextOrderBy?.toISOString() ?? null,

            // Suggested limits
            suggestedParMin: hasHistory ? suggestedParMin : null,
            suggestedROP:    hasHistory ? suggestedROP    : null,
            suggestedParMax: hasHistory ? suggestedParMax : null,
        };
    });

    return NextResponse.json({
        days,
        cutoffDate: cutoffStr,
        suggestions,
        totalTracked: inventoryItems.length,
        withHistory:  suggestions.filter(s => s.hasHistory).length,
    });
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const items: { inventoryItemId: string; parMin: number; parMax: number; reorderPoint: number }[] =
        body.items ?? [];

    if (!Array.isArray(items) || items.length === 0) {
        return NextResponse.json({ error: "items array is required" }, { status: 400 });
    }

    const updated: string[] = [];

    for (const it of items) {
        const { inventoryItemId, parMin, parMax, reorderPoint } = it;
        if (!inventoryItemId) continue;

        await prisma.inventoryItem.update({
            where: { id: inventoryItemId },
            data: {
                parMin:       Number(parMin),
                parMax:       Number(parMax),
                reorderPoint: Number(reorderPoint),
            },
        });
        updated.push(inventoryItemId);
    }

    logAudit({
        session,
        action:      "UPDATE",
        targetTable: "InventoryItem",
        targetId:    "bulk",
        targetName:  `PAR suggestions applied (${updated.length} items)`,
        newValues:   { appliedCount: updated.length },
        request:     req,
    });

    return NextResponse.json({ applied: updated.length });
}
