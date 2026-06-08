/**
 * POST /api/loss/upload  (Admin only)
 *   body: { filename, content }  — raw CSV text of either export.
 * Auto-detects loss-management vs discounts, parses, and replaces the data
 * for each date found (idempotent re-upload).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { detectFileType, parseLossManagement, parseDiscounts } from "@/lib/loss-parser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const asDate = (s: string) => new Date(s + "T00:00:00.000Z");

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { filename, content } = await req.json();
    if (!content || typeof content !== "string") return NextResponse.json({ error: "Missing file content" }, { status: 400 });

    const type = detectFileType(content);
    if (!type) return NextResponse.json({ error: "Unrecognised file. Expecting a loss-management or discounts CSV." }, { status: 400 });

    if (type === "loss") {
        const { rows, errors, date } = parseLossManagement(content);
        if (!date) return NextResponse.json({ error: "No valid complaint rows found." }, { status: 400 });
        const dates = [...new Set(rows.map(r => r.businessDate))];
        for (const d of dates) {
            await db.lossComplaint.deleteMany({ where: { businessDate: asDate(d) } });
        }
        if (rows.length) await db.lossComplaint.createMany({
            data: rows.map(r => ({ ...r, businessDate: asDate(r.businessDate) })),
        });
        for (const d of dates) {
            const count = rows.filter(r => r.businessDate === d).length;
            await db.lossUpload.upsert({
                where: { businessDate: asDate(d) },
                update: { complaintCount: count, hasComplaints: true, uploadedAt: new Date() },
                create: { businessDate: asDate(d), complaintCount: count, hasComplaints: true },
            });
        }
        return NextResponse.json({ ok: true, type, date, imported: rows.length, errors });
    }

    // discounts
    const { rows, date } = parseDiscounts(content);
    if (!date) return NextResponse.json({ error: "No valid discount rows found." }, { status: 400 });
    const dates = [...new Set(rows.map(r => r.businessDate))];
    for (const d of dates) {
        await db.lossDiscount.deleteMany({ where: { businessDate: asDate(d) } });
    }
    if (rows.length) await db.lossDiscount.createMany({
        data: rows.map(r => ({ ...r, businessDate: asDate(r.businessDate), createTime: r.createTime ? new Date(r.createTime) : null })),
    });
    for (const d of dates) {
        const count = rows.filter(r => r.businessDate === d).length;
        await db.lossUpload.upsert({
            where: { businessDate: asDate(d) },
            update: { discountCount: count, hasDiscounts: true, uploadedAt: new Date() },
            create: { businessDate: asDate(d), discountCount: count, hasDiscounts: true },
        });
    }
    return NextResponse.json({ ok: true, type, date, imported: rows.length, errors: [] });
}
