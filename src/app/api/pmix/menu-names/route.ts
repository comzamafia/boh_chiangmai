/**
 * GET /api/pmix/menu-names
 *
 * Distinct PMIX item names seen across uploads (last 365 days), with whether
 * the item is linked to a BOH recipe (so a report can explode it into
 * ingredients). Powers the station menu-assignment picker.
 *
 * Response: { items: { itemName, category, linked, totalQty }[] }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextResponse } from "next/server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const from = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
    const uploads = await db.pmixUpload.findMany({
        where: {
            branchId,
            OR: [
                { businessDate: { gte: from } },
                { businessDate: null, uploadedAt: { gte: from } },
            ],
        },
        select: { id: true },
    });
    const uploadIds = uploads.map((u: { id: string }) => u.id);
    if (uploadIds.length === 0) return NextResponse.json({ items: [] });

    const rows = await db.pmixItem.findMany({
        where:  { uploadId: { in: uploadIds }, branchId },
        select: { itemName: true, category: true, recipeId: true, qtySold: true },
    });

    const map = new Map<string, { itemName: string; category: string; linked: boolean; totalQty: number }>();
    for (const r of rows as { itemName: string; category: string; recipeId: string | null; qtySold: number }[]) {
        const ex = map.get(r.itemName);
        if (ex) {
            ex.totalQty += Number(r.qtySold ?? 0);
            if (r.recipeId) ex.linked = true;
        } else {
            map.set(r.itemName, {
                itemName: r.itemName,
                category: r.category ?? "",
                linked:   !!r.recipeId,
                totalQty: Number(r.qtySold ?? 0),
            });
        }
    }

    const items = [...map.values()].sort((a, b) => b.totalQty - a.totalQty || a.itemName.localeCompare(b.itemName));
    return NextResponse.json({ items });
}
