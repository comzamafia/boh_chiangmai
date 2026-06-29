/**
 * POST /api/server-perf/upload  (Admin only)
 *   body: { filename, content } — the POS "Server Sales Data" CSV.
 * Parses, then replaces the data for each business date found.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { detectServerSales, parseServerSales } from "@/lib/server-sales-parser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const asDate = (s: string) => new Date(s + "T00:00:00.000Z");

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { content } = await req.json();
    if (!content || typeof content !== "string") return NextResponse.json({ error: "Missing file content" }, { status: 400 });
    if (!detectServerSales(content)) return NextResponse.json({ error: "Unrecognised file. Expecting a Server Sales Data CSV." }, { status: 400 });

    const { rows, date } = parseServerSales(content);
    if (!date || rows.length === 0) return NextResponse.json({ error: "No server rows found." }, { status: 400 });

    const dates = [...new Set(rows.map(r => r.businessDate))];
    for (const d of dates) await db.serverSalesRow.deleteMany({ where: { businessDate: asDate(d), branchId } });
    await db.serverSalesRow.createMany({
        data: rows.map(r => ({
            ...r,
            businessDate: asDate(r.businessDate),
            shiftStart: r.shiftStart ? new Date(r.shiftStart) : null,
            shiftEnd: r.shiftEnd ? new Date(r.shiftEnd) : null,
            branchId,
        })),
    });
    for (const d of dates) {
        const count = rows.filter(r => r.businessDate === d).length;
        const existing = await db.serverSalesUpload.findFirst({ where: { businessDate: asDate(d), branchId } });
        if (existing) {
            await db.serverSalesUpload.update({
                where: { id: existing.id },
                data: { serverCount: count, uploadedAt: new Date() },
            });
        } else {
            await db.serverSalesUpload.create({
                data: { businessDate: asDate(d), serverCount: count, branchId },
            });
        }
    }
    return NextResponse.json({ ok: true, date, imported: rows.length, servers: [...new Set(rows.map(r => r.staffName))].length });
}
