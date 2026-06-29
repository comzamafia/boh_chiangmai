/**
 * GET /api/pmix/trend?limit=10
 *
 * CR 2.5 — Ingredient consumption trend across recent PMIX uploads.
 * For each upload (last N, ordered by uploadedAt asc), returns the
 * total estimated ingredient consumption (sum of BOM-exploded qty).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { searchParams } = new URL(req.url);
    const limit = Math.max(2, Math.min(20, Number(searchParams.get("limit") ?? 10)));

    // Load recent uploads ordered by upload date
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploads: any[] = await (prisma as any).pmixUpload.findMany({
        where: { branchId },
        orderBy: { uploadedAt: "desc" },
        take: limit,
        select: { id: true, periodLabel: true, uploadedAt: true, totalItems: true, totalQty: true },
    });

    if (uploads.length === 0) {
        return NextResponse.json({ trend: [] });
    }

    // Reverse so oldest is first (left-to-right on chart)
    uploads.reverse();

    // For each upload, compute total ingredient consumption via BOM
    const uploadIds = uploads.map((u: any) => u.id);

    // Load all PmixItems with recipeId for these uploads in one query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const allLinkedItems: any[] = await (prisma as any).pmixItem.findMany({
        where: { uploadId: { in: uploadIds }, recipeId: { not: null }, branchId },
        select: { uploadId: true, recipeId: true, qtySold: true },
    });

    if (allLinkedItems.length === 0) {
        // No BOM links yet — fall back to totalQty
        return NextResponse.json({
            trend: uploads.map((u: any) => ({
                uploadId:          u.id,
                label:             u.periodLabel ?? new Date(u.uploadedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
                uploadedAt:        u.uploadedAt,
                totalIngQty:       0,
                totalMenuQty:      u.totalQty,
                linkedMenuItems:   0,
            })),
        });
    }

    // Get all unique recipeIds across all uploads
    const recipeIds = [...new Set(allLinkedItems.map((i: any) => i.recipeId as string))];

    // Load recipe ingredients once (use include only, not combined with select)
    const recipeIngredients = await prisma.recipeIngredient.findMany({
        where: { recipeId: { in: recipeIds }, branchId },
        include: {
            recipe: { select: { id: true, yieldAmount: true } },
        },
    });

    // Group recipe ingredients by recipeId for fast lookup
    const riByRecipe = new Map<string, { quantity: number; yieldAmount: number }[]>();
    for (const ri of recipeIngredients) {
        const key = ri.recipeId;
        if (!riByRecipe.has(key)) riByRecipe.set(key, []);
        riByRecipe.get(key)!.push({
            quantity:    Number(ri.quantity),
            yieldAmount: Number(ri.recipe?.yieldAmount ?? 1),
        });
    }

    // Group linked items by uploadId
    const itemsByUpload = new Map<string, { recipeId: string; qtySold: number }[]>();
    for (const item of allLinkedItems) {
        if (!itemsByUpload.has(item.uploadId)) itemsByUpload.set(item.uploadId, []);
        itemsByUpload.get(item.uploadId)!.push({ recipeId: item.recipeId, qtySold: item.qtySold });
    }

    // Build trend points
    const trend = uploads.map((u: any) => {
        const linkedItems = itemsByUpload.get(u.id) ?? [];
        let totalIngQty = 0;

        for (const item of linkedItems) {
            const riList = riByRecipe.get(item.recipeId) ?? [];
            for (const ri of riList) {
                const perServing = ri.quantity / ri.yieldAmount;
                totalIngQty += perServing * item.qtySold;
            }
        }

        return {
            uploadId:        u.id,
            label:           u.periodLabel ?? new Date(u.uploadedAt).toLocaleDateString("en-CA", { month: "short", day: "numeric" }),
            uploadedAt:      u.uploadedAt,
            totalIngQty:     Math.round(totalIngQty * 10) / 10,
            totalMenuQty:    u.totalQty,
            linkedMenuItems: linkedItems.length,
        };
    });

    return NextResponse.json({ trend });
}
