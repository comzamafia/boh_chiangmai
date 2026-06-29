/**
 * GET /api/pmix/uploads/calendar?month=YYYY-MM (v1)
 *
 * Returns all uploads for the given month (or all-time if no month given).
 * Used to render dots on the calendar UI.
 *
 * Response: [{ date: "YYYY-MM-DD"; uploadIds: string[]; count: number; totalQty: number; totalSales: string }]
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const { searchParams } = new URL(req.url);
    const month = searchParams.get("month"); // "YYYY-MM"

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    // Build date filter
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { branchId };
    if (month) {
        const [y, m] = month.split("-").map(Number);
        const from = new Date(Date.UTC(y, m - 1, 1));
        const to   = new Date(Date.UTC(y, m, 1)); // exclusive
        where.businessDate = { gte: from, lt: to };
    }

    const uploads = await db.pmixUpload.findMany({
        where,
        select: {
            id:           true,
            fileName:     true,
            businessDate: true,
            uploadedAt:   true,
            periodLabel:  true,
            totalQty:     true,
            totalSales:   true,
        },
        orderBy: [
            { businessDate: "desc" },
            { uploadedAt:   "desc" },
        ],
        take: 500,
    });

    // Group by businessDate (fall back to uploadedAt date for old records)
    const grouped = new Map<string, {
        date: string;
        uploadIds: string[];
        count: number;
        totalQty: number;
        totalSales: number;
        uploads: { id: string; fileName: string; periodLabel: string | null; uploadedAt: string }[];
    }>();

    for (const up of uploads) {
        const rawDate = up.businessDate ?? up.uploadedAt;
        const date    = new Date(rawDate).toISOString().slice(0, 10); // "YYYY-MM-DD"

        if (!grouped.has(date)) {
            grouped.set(date, { date, uploadIds: [], count: 0, totalQty: 0, totalSales: 0, uploads: [] });
        }
        const g = grouped.get(date)!;
        g.uploadIds.push(up.id);
        g.count++;
        g.totalQty   += Number(up.totalQty ?? 0);
        g.totalSales += Number(up.totalSales ?? 0);
        g.uploads.push({
            id:          up.id,
            fileName:    up.fileName,
            periodLabel: up.periodLabel ?? null,
            uploadedAt:  up.uploadedAt,
        });
    }

    const days = [...grouped.values()]
        .map(g => ({ ...g, totalSales: g.totalSales.toFixed(2) }))
        .sort((a, b) => b.date.localeCompare(a.date));

    return NextResponse.json(days);
}
