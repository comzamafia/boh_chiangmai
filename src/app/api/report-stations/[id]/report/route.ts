/**
 * GET /api/report-stations/[id]/report?days=N
 *
 * Explodes the station's assigned PMIX menus into ingredient prep quantities
 * over the last N days, via each menu's linked recipe BOM
 * (RecipeIngredient.quantity / Recipe.yieldAmount × qtySold).
 *
 * Returns BOTH views so the client can toggle without refetching:
 *   - dates[]            : actual dates in the window (asc)
 *   - per ingredient     : byDate[] aligned to dates, dowAvg[7] (Mon..Sun), total
 *   - rop                : InventoryItem.reorderPoint (recipe units) or null
 *   - unit metadata      : recipeUnit, groupId, conversionRate, purchaseUnit
 *   - menus[]            : which assigned menus drive this ingredient
 *   - unlinkedMenus[]    : assigned menus with no linked recipe (excluded from totals)
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

const dowIndex = (d: Date) => (d.getUTCDay() + 6) % 7; // Mon=0 … Sun=6

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { id } = await params;
    const daysParam = Number(new URL(req.url).searchParams.get("days") ?? 7);
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 90);

    const station = await db.reportStation.findFirst({
        where: { id, branchId },
        include: { menus: true },
    });
    if (!station) return NextResponse.json({ error: "Station not found" }, { status: 404 });

    const assigned: string[] = station.menus.map((m: { itemName: string }) => m.itemName);
    const emptyResp = {
        station: { id: station.id, name: station.name, icon: station.icon, color: station.color },
        days, dates: [], dowCounts: [0, 0, 0, 0, 0, 0, 0],
        ingredients: [], unlinkedMenus: [], assignedCount: assigned.length, linkedMenuCount: 0,
    };
    if (assigned.length === 0) return NextResponse.json(emptyResp);

    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Uploads in window → date + dow map
    const uploads = await db.pmixUpload.findMany({
        where: {
            OR: [
                { businessDate: { gte: from } },
                { businessDate: null, uploadedAt: { gte: from } },
            ],
        },
        select: { id: true, businessDate: true, uploadedAt: true },
    });
    if (uploads.length === 0) return NextResponse.json(emptyResp);

    const uploadDate = new Map<string, string>();
    for (const u of uploads) {
        uploadDate.set(u.id as string, ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10));
    }
    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // Distinct dates + how many of each weekday appear in the window
    const dates = [...new Set([...uploadDate.values()])].sort();
    const dowCounts = [0, 0, 0, 0, 0, 0, 0];
    for (const d of dates) dowCounts[dowIndex(new Date(d + "T00:00:00.000Z"))] += 1;
    const dateIndex = new Map(dates.map((d, i) => [d, i]));

    // Assigned menu rows in window
    const items = await db.pmixItem.findMany({
        where:  { uploadId: { in: uploadIds }, itemName: { in: assigned } },
        select: { itemName: true, qtySold: true, recipeId: true, uploadId: true },
    });

    // Recipe BOM for linked menus
    const recipeIds = [...new Set(items.filter((i: { recipeId: string | null }) => i.recipeId).map((i: { recipeId: string }) => i.recipeId))] as string[];
    const recipeIngredients = recipeIds.length > 0
        ? await db.recipeIngredient.findMany({
            where:   { recipeId: { in: recipeIds } },
            include: {
                ingredient: { select: { id: true, name: true, recipeUnit: true, groupId: true, conversionRate: true, purchaseUnit: true, reportUnit: true } },
                recipe:     { select: { id: true, yieldAmount: true } },
            },
        })
        : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const riByRecipe = new Map<string, any[]>();
    for (const ri of recipeIngredients) {
        const arr = riByRecipe.get(ri.recipeId) ?? [];
        arr.push(ri); riByRecipe.set(ri.recipeId, arr);
    }

    // Accumulate ingredient usage per date
    interface IngAgg {
        ingredientId: string; name: string; recipeUnit: string; groupId: string;
        conversionRate: number; purchaseUnit: string; reportUnit: string | null;
        byDate: number[]; total: number; menus: Set<string>;
    }
    const agg = new Map<string, IngAgg>();
    const linkedMenus = new Set<string>();
    const unlinkedMenus = new Set<string>();

    for (const it of items as { itemName: string; qtySold: number; recipeId: string | null; uploadId: string }[]) {
        const date = uploadDate.get(it.uploadId);
        const di   = date ? dateIndex.get(date) : undefined;
        if (di === undefined) continue;
        const qty = Number(it.qtySold ?? 0);
        if (qty === 0) continue;

        const riList = it.recipeId ? riByRecipe.get(it.recipeId) : undefined;
        if (!riList || riList.length === 0) { unlinkedMenus.add(it.itemName); continue; }
        linkedMenus.add(it.itemName);

        const yieldAmt = Number(riList[0]?.recipe?.yieldAmount ?? 1) || 1;
        for (const ri of riList) {
            const used = (Number(ri.quantity) / yieldAmt) * qty;
            const ing  = ri.ingredient;
            let a = agg.get(ing.id);
            if (!a) {
                a = {
                    ingredientId: ing.id, name: ing.name, recipeUnit: ing.recipeUnit, groupId: ing.groupId,
                    conversionRate: Number(ing.conversionRate ?? 0), purchaseUnit: ing.purchaseUnit,
                    reportUnit: ing.reportUnit ?? null,
                    byDate: new Array(dates.length).fill(0), total: 0, menus: new Set<string>(),
                };
                agg.set(ing.id, a);
            }
            a.byDate[di] += used;
            a.total      += used;
            a.menus.add(it.itemName);
        }
    }

    // ROP per ingredient
    const ingredientIds = [...agg.keys()];
    const invItems = ingredientIds.length > 0
        ? await db.inventoryItem.findMany({ where: { ingredientId: { in: ingredientIds } }, select: { ingredientId: true, reorderPoint: true } })
        : [];
    const ropById = new Map<string, number>();
    for (const iv of invItems) ropById.set(iv.ingredientId as string, Number(iv.reorderPoint ?? 0));

    const ingredients = [...agg.values()].map(a => {
        // weekday average = sum of byDate grouped by dow / number of that weekday in window
        const dowSum = [0, 0, 0, 0, 0, 0, 0];
        a.byDate.forEach((q, i) => { dowSum[dowIndex(new Date(dates[i] + "T00:00:00.000Z"))] += q; });
        const dowAvg = dowSum.map((s, d) => dowCounts[d] > 0 ? +(s / dowCounts[d]).toFixed(3) : 0);
        return {
            ingredientId: a.ingredientId, name: a.name,
            recipeUnit: a.recipeUnit, groupId: a.groupId,
            conversionRate: a.conversionRate, purchaseUnit: a.purchaseUnit,
            reportUnit: a.reportUnit,
            byDate: a.byDate.map(q => +q.toFixed(3)),
            dowAvg,
            total: +a.total.toFixed(3),
            rop: ropById.has(a.ingredientId) ? ropById.get(a.ingredientId)! : null,
            menus: [...a.menus].sort(),
        };
    }).sort((x, y) => y.total - x.total);

    return NextResponse.json({
        station: { id: station.id, name: station.name, icon: station.icon, color: station.color },
        days,
        dates,
        dowCounts,
        ingredients,
        unlinkedMenus: [...unlinkedMenus].sort(),
        assignedCount: assigned.length,
        linkedMenuCount: linkedMenus.size,
    });
}
