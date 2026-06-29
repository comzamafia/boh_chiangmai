/**
 * POST /api/pmix/sync-sales
 * Converts PmixItem rows for an upload into SalesEntry rows for a given date.
 *
 * Body: { uploadId: string; date: string; replace: boolean }
 *   replace=true  → delete all pmix-tagged SalesEntries for that date first
 *
 * Returns: { synced: number; skipped: number; date: string; uploadId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

/** Compute BOM cost per recipe-unit for a linked recipe */
async function calcUnitCost(recipeId: string, branchId: string): Promise<number | null> {
    const recipe = await prisma.recipe.findFirst({
        where: { id: recipeId, branchId },
        include: {
            ingredients: {
                include: {
                    ingredient: {
                        select: {
                            purchasePrice: true,
                            conversionRate: true,
                            yieldPercent: true,
                        },
                    },
                },
            },
        },
    });
    if (!recipe) return null;

    const ingCost = recipe.ingredients.reduce((s, ri) => {
        const ing = ri.ingredient;
        const cpu =
            Number(ing.purchasePrice) /
            Number(ing.conversionRate) /
            (Number(ing.yieldPercent) / 100);
        return s + cpu * Number(ri.quantity);
    }, 0);

    const laborHrs = (recipe.prepTime + recipe.cookTime) / 60;
    const laborCost = Number(recipe.laborCostPerHour) * laborHrs;
    const totalBatch = ingCost + laborCost + Number(recipe.energyCostPerBatch);
    const yieldAmt = Number(recipe.yieldAmount);
    return yieldAmt > 0 ? totalBatch / yieldAmt : null;
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager", "analyst"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { uploadId, date, replace } = await req.json();

    if (!uploadId || !date) {
        return NextResponse.json({ error: "uploadId and date are required" }, { status: 400 });
    }

    // Validate date format
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }

    // Verify upload exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const upload = await (prisma as any).pmixUpload.findFirst({ where: { id: uploadId, branchId } });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // Load all PMIX items for this upload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pmixItems: any[] = await (prisma as any).pmixItem.findMany({
        where: { uploadId, branchId },
    });

    const itemsToSync = pmixItems.filter(i => i.qtySold > 0);
    if (itemsToSync.length === 0) {
        return NextResponse.json({ synced: 0, skipped: 0, date, uploadId });
    }

    // Pre-compute BOM costs for all linked recipeIds
    const linkedRecipeIds = [...new Set(
        itemsToSync.map(i => i.recipeId).filter(Boolean) as string[]
    )];
    const costCache: Record<string, number | null> = {};
    await Promise.all(
        linkedRecipeIds.map(async id => {
            costCache[id] = await calcUnitCost(id, branchId);
        })
    );

    // Replace = delete existing pmix-tagged entries for this date
    if (replace) {
        await prisma.salesEntry.deleteMany({
            where: {
                date,
                notes: { startsWith: "pmix:" },
                branchId,
            },
        });
    }

    // Batch create SalesEntries
    let synced = 0;
    let skipped = 0;

    // createMany is faster but doesn't support relations — use it here
    const rows = itemsToSync.map(item => {
        const unitPrice =
            item.qtySold > 0 ? Number(item.netSales) / item.qtySold : 0;
        const revenue = Number(item.netSales);
        const unitCost = item.recipeId ? (costCache[item.recipeId] ?? null) : null;

        if (unitPrice <= 0 && revenue <= 0) { skipped++; return null; }
        synced++;

        return {
            date,
            recipeId: item.recipeId ?? null,
            recipeName: item.itemName,
            qty: item.qtySold,
            unitPrice,
            revenue,
            unitCost,
            notes: `pmix:${uploadId}`,
            branchId,
        };
    }).filter(Boolean) as {
        date: string; recipeId: string | null; recipeName: string;
        qty: number; unitPrice: number; revenue: number;
        unitCost: number | null; notes: string; branchId: string;
    }[];

    await prisma.salesEntry.createMany({ data: rows });

    // Update upload record with the synced date (store in periodLabel if it looks like a date, else append)
    const newLabel = upload.periodLabel?.match(/^\d{4}-\d{2}-\d{2}/)
        ? upload.periodLabel
        : date;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).pmixUpload.update({
        where: { id: uploadId },
        data: { periodLabel: newLabel },
    });

    return NextResponse.json({ synced, skipped, date, uploadId });
}

/**
 * GET /api/pmix/sync-sales?uploadId=X
 * Returns sync status: which dates this upload has been synced to.
 */
export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const uploadId = new URL(req.url).searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId required" }, { status: 400 });

    // Find distinct dates in SalesEntry where notes = pmix:{uploadId}
    const entries = await prisma.salesEntry.findMany({
        where: { notes: `pmix:${uploadId}`, branchId },
        select: { date: true, id: true },
        orderBy: { date: "asc" },
    });

    const dates = [...new Set(entries.map(e => e.date))];
    return NextResponse.json({ uploadId, syncedDates: dates, totalEntries: entries.length });
}
