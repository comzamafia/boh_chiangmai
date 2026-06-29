/**
 * GET /api/loss/uncategorized  (Admin only)
 * Distinct raw reason texts still classified as "Uncategorized", with how many
 * complaints + net $ each represents — so they can be triaged into categories.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = await db.lossComplaint.findMany({
        where: { reasonCategory: "Uncategorized", actionType: "Complaint", branchId },
        select: { reasonRaw: true, netAmount: true },
    });
    const m = new Map<string, { count: number; net: number }>();
    for (const r of rows) {
        const k = (r.reasonRaw ?? "").trim();
        if (!k) continue;
        const a = m.get(k) ?? { count: 0, net: 0 };
        a.count++; a.net += Number(r.netAmount);
        m.set(k, a);
    }
    const list = [...m.entries()]
        .map(([reasonRaw, v]) => ({ reasonRaw, count: v.count, net: Math.round(v.net * 100) / 100 }))
        .sort((a, b) => b.count - a.count);
    return NextResponse.json(list);
}
