/**
 * POST /api/pmix/upload
 * Accepts multipart/form-data with a "file" field (XLSX or CSV).
 * Parses PMIX format, stores PmixUpload + PmixItem + PmixModifier rows.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import * as XLSX from "xlsx";

// Station mapping by category
export const CATEGORY_STATION: Record<string, string> = {
    "Appetizers":      "Grill / Appetizer",
    "Noodles":         "Wok",
    "Fried Rice":      "Wok",
    "Stir Fry":        "Wok",
    "Curry":           "Curry",
    "Soups & Salads":  "Expo",
    "Desserts":        "Dessert",
    "Sides":           "Expo",
    "Kids Meal":       "Wok",
    "Mocktails":       "Bar",
    "Cocktails":       "Bar",
    "Beverages":       "Bar",
    "Tea & Coffee":    "Bar",
    "Beer":            "Bar",
    "Shots & Spirits": "Bar",
    "Red Wine":        "Bar",
    "White Wine":      "Bar",
    "OPEN ITEM":       "Expo",
};

function toNum(v: unknown): number {
    if (v === "" || v == null) return 0;
    return Number(v) || 0;
}

interface RawRow {
    type: string;
    menu: string;
    category: string;
    itemCode: string;
    itemName: string;
    modifierGroup: string;
    modifier: string;
    qtySold: number;
    grossSales: number;
    refundQty: number;
    refundAmount: number;
    discountAmount: number;
    netSales: number;
    pctNetCount: number | null;
    pctNetSales: number | null;
}

function parseRows(data: unknown[][]): RawRow[] {
    // Skip header row (row 0), skip Menu/Category aggregate rows
    return data.slice(1)
        .filter(r => r[0] === "Item" || r[0] === "Modifier Group" || r[0] === "Modifier")
        .map(r => ({
            type:          String(r[0] ?? ""),
            menu:          String(r[1] ?? ""),
            category:      String(r[2] ?? ""),
            itemCode:      String(r[3] ?? ""),
            itemName:      String(r[4] ?? "").trim(),
            modifierGroup: String(r[5] ?? "").trim(),
            modifier:      String(r[6] ?? "").trim(),
            qtySold:       Math.round(toNum(r[7])),
            grossSales:    toNum(r[8]),
            refundQty:     Math.round(toNum(r[9])),
            refundAmount:  toNum(r[10]),
            discountAmount: toNum(r[11]),
            netSales:      toNum(r[12]),
            pctNetCount:   r[13] !== "" ? toNum(r[13]) : null,
            pctNetSales:   r[14] !== "" ? toNum(r[14]) : null,
        }));
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager", "analyst"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const periodLabel   = (formData.get("periodLabel")   as string | null)?.trim() || null;
    const businessDateRaw = (formData.get("businessDate") as string | null)?.trim() || null;
    const replaceExisting = (formData.get("replaceExisting") as string | null) === "true";
    // Parse YYYY-MM-DD → midnight UTC Date, or null
    const businessDate  = businessDateRaw ? new Date(businessDateRaw + "T00:00:00.000Z") : null;

    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["xlsx", "xls", "csv"].includes(ext ?? "")) {
        return NextResponse.json({ error: "Only XLSX, XLS or CSV files are supported" }, { status: 400 });
    }

    // ── Duplicate-date guard ────────────────────────────────────────────────
    // A PMIX report is one business day. Uploading the same day twice silently
    // double-counts in range analytics, so warn (409) unless the caller opts to
    // replace the existing upload(s) for that date.
    let dupIds: string[] = [];
    if (businessDate) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const existing: { id: string }[] = await (prisma as any).pmixUpload.findMany({
            where:  { businessDate, branchId },
            select: { id: true },
        });
        dupIds = existing.map(e => e.id);
        if (dupIds.length > 0 && !replaceExisting) {
            return NextResponse.json(
                { error: "duplicate", duplicate: true, businessDate: businessDateRaw, existingCount: dupIds.length },
                { status: 409 },
            );
        }
    }

    // Read file bytes
    const buffer = Buffer.from(await file.arrayBuffer());
    const wb = XLSX.read(buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

    const rows = parseRows(raw);

    // Try to auto-link items to BOH recipes by fuzzy name match
    const recipes = await prisma.recipe.findMany({ where: { branchId }, select: { id: true, name: true } });
    function findRecipeId(itemName: string): string | null {
        const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
        const target = norm(itemName);
        for (const r of recipes) {
            const rn = norm(r.name);
            if (rn === target || rn.includes(target) || target.includes(rn)) {
                return r.id;
            }
        }
        return null;
    }

    // Build structured items + modifiers
    type ItemPayload = {
        menu: string; category: string; itemCode: string; itemName: string;
        qtySold: number; grossSales: number; refundQty: number;
        refundAmount: number; discountAmount: number; netSales: number;
        pctNetCount: number | null; pctNetSales: number | null; recipeId: string | null;
        modifiers: {
            modifierGroup: string; modifier: string; qtySold: number;
            grossSales: number; refundQty: number; refundAmount: number;
            discountAmount: number; netSales: number;
        }[];
    };

    const items: ItemPayload[] = [];
    let currentItem: ItemPayload | null = null;
    let currentModGroup = "";

    for (const row of rows) {
        if (row.type === "Item") {
            currentItem = {
                menu: row.menu, category: row.category,
                itemCode: row.itemCode || "", itemName: row.itemName,
                qtySold: row.qtySold, grossSales: row.grossSales,
                refundQty: row.refundQty, refundAmount: row.refundAmount,
                discountAmount: row.discountAmount, netSales: row.netSales,
                pctNetCount: row.pctNetCount, pctNetSales: row.pctNetSales,
                recipeId: findRecipeId(row.itemName),
                modifiers: [],
            };
            items.push(currentItem);
        } else if (row.type === "Modifier Group") {
            currentModGroup = row.modifierGroup;
        } else if (row.type === "Modifier" && currentItem) {
            currentItem.modifiers.push({
                modifierGroup: currentModGroup, modifier: row.modifier,
                qtySold: row.qtySold, grossSales: row.grossSales,
                refundQty: row.refundQty, refundAmount: row.refundAmount,
                discountAmount: row.discountAmount, netSales: row.netSales,
            });
        }
    }

    const totalQty   = items.reduce((s, i) => s + i.qtySold, 0);
    const totalSales = items.reduce((s, i) => s + i.netSales, 0);

    // Persist in transaction
    const upload = await prisma.$transaction(async (tx) => {
        // Replace mode: drop prior uploads for this business date first
        // (cascade removes their items + modifiers).
        if (dupIds.length > 0 && replaceExisting) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (tx as any).pmixUpload.deleteMany({ where: { id: { in: dupIds }, branchId } });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const up = await (tx as any).pmixUpload.create({
            data: {
                fileName:     file.name,
                periodLabel,
                businessDate,
                totalItems:   items.length,
                totalQty,
                totalSales,
                branchId,
            },
        });

        for (const item of items) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const pi = await (tx as any).pmixItem.create({
                data: {
                    uploadId: up.id,
                    menu: item.menu, category: item.category,
                    itemCode: item.itemCode || null,
                    itemName: item.itemName,
                    qtySold: item.qtySold, grossSales: item.grossSales,
                    refundQty: item.refundQty, refundAmount: item.refundAmount,
                    discountAmount: item.discountAmount, netSales: item.netSales,
                    pctNetCount: item.pctNetCount, pctNetSales: item.pctNetSales,
                    recipeId: item.recipeId,
                    branchId,
                },
            });
            if (item.modifiers.length > 0) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                await (tx as any).pmixModifier.createMany({
                    data: item.modifiers.map(m => ({ ...m, itemId: pi.id, branchId })),
                });
            }
        }
        return up;
    });

    return NextResponse.json({
        uploadId: upload.id,
        totalItems: items.length,
        totalQty, totalSales,
        businessDate: businessDateRaw,
        replaced: dupIds.length > 0 && replaceExisting ? dupIds.length : 0,
    }, { status: 201 });
}
