import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

// Helper: escape a cell value for CSV (wrap in quotes, escape inner quotes)
function csvCell(val: unknown): string {
    const s = val == null ? "" : String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

function csvRow(cells: unknown[]): string {
    return cells.map(csvCell).join(",");
}

// GET /api/export/ingredients — download all ingredients as CSV (no auth required for export)
export async function GET() {
    try {
        const ingredients = await prisma.ingredient.findMany({
            include: { supplier: { select: { id: true, name: true } } },
            orderBy: { name: "asc" },
        });

        const headers = [
            "Name",
            "Supplier",
            "Group",
            "Purchase Unit",
            "Purchase Price (THB)",
            "Recipe Unit",
            "Yield %",
            "Conversion Rate",
            "Effective Cost per Recipe Unit (THB)",
            "Image URL",
        ];

        const rows = ingredients.map(i => {
            const price  = Number(i.purchasePrice);
            const rate   = Number(i.conversionRate);
            const yld    = Number(i.yieldPercent);
            const effCost = (rate > 0 && yld > 0) ? (price / rate) / (yld / 100) : 0;
            return csvRow([
                i.name,
                i.supplier?.name ?? "",
                i.groupId,
                i.purchaseUnit,
                price.toFixed(2),
                i.recipeUnit,
                yld,
                rate,
                effCost.toFixed(4),
                i.imageUrl ?? "",
            ]);
        });

        const csv = [csvRow(headers), ...rows].join("\r\n");
        const bom = "﻿"; // UTF-8 BOM so Excel opens correctly

        return new NextResponse(bom + csv, {
            status: 200,
            headers: {
                "Content-Type": "text/csv; charset=utf-8",
                "Content-Disposition": `attachment; filename="ingredients-${new Date().toISOString().slice(0,10)}.csv"`,
            },
        });
    } catch (e) {
        console.error("Export ingredients error:", e);
        return NextResponse.json({ error: "Failed to export ingredients" }, { status: 500 });
    }
}
