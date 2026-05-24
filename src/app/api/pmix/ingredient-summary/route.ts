/**
 * GET /api/pmix/ingredient-summary?uploadId=X
 *
 * Extracts protein usage data from PMIX modifiers (no BOM linkage needed).
 * Returns:
 *   - mainProtein: protein choice breakdown (modifierGroup contains "protein", not "extra")
 *   - extraProtein: extra add-on breakdown (modifierGroup contains "extra" OR modifier starts with "Extra ")
 *   - Both broken down by type totals and by dish detail
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const uploadId = searchParams.get("uploadId");
    if (!uploadId) return NextResponse.json({ error: "uploadId is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // 1. Load upload header
    const upload = await db.pmixUpload.findUnique({
        where: { id: uploadId },
        select: { id: true, periodLabel: true, uploadedAt: true },
    });
    if (!upload) return NextResponse.json({ error: "Upload not found" }, { status: 404 });

    // 2. Load all PMIX items with modifiers
    const pmixItems = await db.pmixItem.findMany({
        where: { uploadId },
        include: { modifiers: true },
    });

    // ─── classify each modifier ───────────────────────────────────────────
    interface ProteinByType { proteinType: string; qty: number }
    interface ProteinByDish { category: string; dish: string; proteinType: string; qty: number }

    const mainByType  = new Map<string, number>();
    const mainByDish  = new Map<string, ProteinByDish>();  // key: `dish|protein`
    const extraByType = new Map<string, number>();
    const extraByDish = new Map<string, ProteinByDish>(); // key: `dish|extra`

    const mainGroupNames  = new Set<string>();
    const extraGroupNames = new Set<string>();

    for (const item of pmixItems) {
        const dishName   = item.itemName as string;
        const category   = (item.category as string) ?? "";

        for (const mod of item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>) {
            const grp  = (mod.modifierGroup ?? "").toLowerCase();
            const name = mod.modifier ?? "";
            const qty  = Number(mod.qtySold ?? 0);

            const isExtra = grp.includes("extra") || name.toLowerCase().startsWith("extra ");
            const isMainProtein = grp.includes("protein") && !isExtra;

            if (isMainProtein) {
                mainGroupNames.add(mod.modifierGroup);
                mainByType.set(name, (mainByType.get(name) ?? 0) + qty);
                const k = `${dishName}|||${name}`;
                const existing = mainByDish.get(k);
                if (existing) {
                    existing.qty += qty;
                } else {
                    mainByDish.set(k, { category, dish: dishName, proteinType: name, qty });
                }
            } else if (isExtra) {
                extraGroupNames.add(mod.modifierGroup);
                extraByType.set(name, (extraByType.get(name) ?? 0) + qty);
                const k = `${dishName}|||${name}`;
                const existing = extraByDish.get(k);
                if (existing) {
                    existing.qty += qty;
                } else {
                    extraByDish.set(k, { category, dish: dishName, proteinType: name, qty });
                }
            }
        }
    }

    // ─── Sort helpers ─────────────────────────────────────────────────────
    const mainByTypeArr: ProteinByType[] = [...mainByType.entries()]
        .map(([proteinType, qty]) => ({ proteinType, qty }))
        .sort((a, b) => b.qty - a.qty);

    const mainTotal = mainByTypeArr.reduce((s, x) => s + x.qty, 0);

    const mainByDishArr: ProteinByDish[] = [...mainByDish.values()]
        .sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            if (a.dish < b.dish) return -1;
            if (a.dish > b.dish) return 1;
            return b.qty - a.qty;
        });

    const extraByTypeArr: ProteinByType[] = [...extraByType.entries()]
        .map(([proteinType, qty]) => ({ proteinType, qty }))
        .sort((a, b) => b.qty - a.qty);

    const extraTotal = extraByTypeArr.reduce((s, x) => s + x.qty, 0);

    const extraByDishArr: ProteinByDish[] = [...extraByDish.values()]
        .sort((a, b) => {
            if (a.category < b.category) return -1;
            if (a.category > b.category) return 1;
            if (a.dish < b.dish) return -1;
            if (a.dish > b.dish) return 1;
            return b.qty - a.qty;
        });

    return NextResponse.json({
        uploadId,
        periodLabel:  upload.periodLabel,
        uploadedAt:   upload.uploadedAt,
        mainProtein: {
            byType:     mainByTypeArr,
            byDish:     mainByDishArr,
            total:      mainTotal,
            groupNames: [...mainGroupNames],
        },
        extraProtein: {
            byType:     extraByTypeArr,
            byDish:     extraByDishArr,
            total:      extraTotal,
            groupNames: [...extraGroupNames],
        },
        hasProteinData: mainByTypeArr.length > 0 || extraByTypeArr.length > 0,
    });
}
