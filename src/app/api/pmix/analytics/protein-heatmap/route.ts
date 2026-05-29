/**
 * GET /api/pmix/analytics/protein-heatmap?days=7
 *
 * Returns Main Protein daily usage for the last N calendar days.
 * Uses the same hybrid classifier as the range API.
 * Quantities are in lb when a Portion Standard exists with portionUnit "oz",
 * otherwise in orders (qty sold).
 *
 * Response:
 *   {
 *     dates:  string[];   // N dates ascending YYYY-MM-DD
 *     items:  ProteinHeatmapRow[];
 *     days:   number;
 *   }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { classifyItem, hasProteinModifier, type RuleRow } from "@/lib/pmix-classifier";

export const dynamic   = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const days = Math.max(1, Math.min(30, Number(searchParams.get("days") ?? 7)));

    // Last N calendar days ending today
    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);
    const dates: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
        const d = new Date(todayDate);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().slice(0, 10));
    }
    const fromStr = dates[0];
    const toStr   = dates[dates.length - 1];

    const fromDate = new Date(fromStr + "T00:00:00.000Z");
    const toDate   = new Date(toStr   + "T23:59:59.999Z");

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
        return NextResponse.json({ dates, items: [], days });
    }

    // 2. Map upload → date
    const uploadDateMap = new Map<string, string>();
    for (const u of uploads) {
        const date = ((u.businessDate ?? u.uploadedAt) as Date).toISOString().slice(0, 10);
        if (!uploadDateMap.has(u.id as string)) {
            uploadDateMap.set(u.id as string, date);
        }
    }

    const uploadIds = uploads.map((u: { id: string }) => u.id);

    // 3. Items + modifiers
    const pmixItems = await db.pmixItem.findMany({
        where:   { uploadId: { in: uploadIds } },
        include: { modifiers: true },
    });

    // 4. Item rules
    const rules: RuleRow[] = await db.pmixItemRule.findMany({
        where:   { isActive: true },
        orderBy: [{ priority: "desc" }, { pattern: "asc" }],
    });

    // 5. Portion standards (for lb conversion)
    const standards = await db.portionStandard.findMany({
        where: { type: { in: ["modifier", "base"] } },
        select: {
            itemName: true, portionSize: true, portionUnit: true,
            ingredient: { select: { name: true } },
        },
    });
    const stdByName = new Map<string, { portionSize: number; portionUnit: string; ingredientName: string }>();
    for (const s of standards) {
        stdByName.set(String(s.itemName).toLowerCase().trim(), {
            portionSize:    Number(s.portionSize),
            portionUnit:    s.portionUnit,
            ingredientName: s.ingredient?.name ?? s.itemName,
        });
    }

    // 6. Accumulate main protein qty per type per date (in orders)
    // protein label → date → orders
    const proteinDay = new Map<string, Map<string, number>>();

    for (const item of pmixItems) {
        const dishName = item.itemName as string;
        const qty      = Number(item.qtySold ?? 0);
        if (qty === 0) continue;

        const date = uploadDateMap.get(item.uploadId as string);
        if (!date) continue;

        const mods = item.modifiers as Array<{ modifierGroup: string; modifier: string; qtySold: number }>;

        if (hasProteinModifier(mods)) {
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

                if (!proteinDay.has(name)) proteinDay.set(name, new Map());
                const m = proteinDay.get(name)!;
                m.set(date, (m.get(date) ?? 0) + modQty);
            }
        } else {
            const result = classifyItem(dishName, rules);
            if (!result || result.category !== "main_protein") continue;
            const label = result.label;
            if (!proteinDay.has(label)) proteinDay.set(label, new Map());
            const m = proteinDay.get(label)!;
            m.set(date, (m.get(date) ?? 0) + qty);
        }
    }

    // 7. Build response — convert to lb where possible
    const r3 = (n: number) => Math.round(n * 1000) / 1000;

    const items = [...proteinDay.entries()]
        .map(([proteinType, dateMap]) => {
            const std = stdByName.get(proteinType.toLowerCase().trim());
            const useLb = std?.portionUnit === "oz";

            const convert = (orders: number) => {
                if (!std) return orders;
                const oz = orders * std.portionSize;
                return useLb ? oz / 16 : oz;
            };
            const displayUnit = useLb ? "lb" : (std ? std.portionUnit : "orders");

            const byDateOrders = dates.map(d => dateMap.get(d) ?? 0);
            const totalOrders  = byDateOrders.reduce((s, q) => s + q, 0);

            const byDate  = byDateOrders.map(q => r3(convert(q)));
            const totalQty = r3(convert(totalOrders));

            return {
                proteinType,
                ingredientName: std?.ingredientName ?? proteinType,
                unit:           displayUnit,
                totalOrders,
                totalQty,
                avgPerDay:      r3(totalQty / days),
                byDate,
            };
        })
        .filter(r => r.totalOrders > 0)
        .sort((a, b) => b.totalOrders - a.totalOrders);

    return NextResponse.json({ dates, items, days });
}
