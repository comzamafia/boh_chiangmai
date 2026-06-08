/**
 * GET /api/loss/reason-map   — list the editable keyword→category rules (seeds defaults if empty)
 * PUT /api/loss/reason-map   — replace all rules { rows: [{keyword, category}] } and re-classify
 *                              every existing complaint's reasonCategory.   (Admin only)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { defaultReasonRows, normalizeWithMap } from "@/lib/loss-parser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    let rows = await db.lossReasonMap.findMany({ orderBy: { sortOrder: "asc" } });
    if (rows.length === 0) {
        await db.lossReasonMap.createMany({ data: defaultReasonRows().map((r, i) => ({ ...r, sortOrder: i })) });
        rows = await db.lossReasonMap.findMany({ orderBy: { sortOrder: "asc" } });
    }
    return NextResponse.json(rows.map((r: { keyword: string; category: string }) => ({ keyword: r.keyword, category: r.category })));
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const body = await req.json();
    const rows: { keyword: string; category: string }[] = (Array.isArray(body.rows) ? body.rows : [])
        .map((r: { keyword?: unknown; category?: unknown }) => ({ keyword: String(r.keyword ?? "").trim(), category: String(r.category ?? "").trim() }))
        .filter((r: { keyword: string; category: string }) => r.keyword && r.category);

    await db.$transaction([
        db.lossReasonMap.deleteMany({}),
        db.lossReasonMap.createMany({ data: rows.map((r, i) => ({ ...r, sortOrder: i })) }),
    ]);

    // Re-classify existing complaints by distinct raw reason
    const complaints = await db.lossComplaint.findMany({ select: { reasonRaw: true } });
    const distinctRaw = [...new Set(complaints.map((c: { reasonRaw: string }) => c.reasonRaw))] as string[];
    let reclassified = 0;
    for (const raw of distinctRaw) {
        const cat = normalizeWithMap(raw, rows);
        const res = await db.lossComplaint.updateMany({ where: { reasonRaw: raw }, data: { reasonCategory: cat } });
        reclassified += res.count;
    }
    return NextResponse.json({ ok: true, rules: rows.length, reclassified });
}
