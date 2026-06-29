/**
 * POST /api/loss/upload  (Admin only)
 *   body: { filename, content }  — raw CSV text of either export.
 * Auto-detects loss-management vs discounts, parses, and replaces the data
 * for each date found (idempotent re-upload).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { detectFileType, parseLossManagement, parseDiscounts, normalizeWithMap } from "@/lib/loss-parser";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const asDate = (s: string) => new Date(s + "T00:00:00.000Z");

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { filename, content } = await req.json();
    if (!content || typeof content !== "string") return NextResponse.json({ error: "Missing file content" }, { status: 400 });

    const type = detectFileType(content);
    if (!type) return NextResponse.json({ error: "Unrecognised file. Expecting a loss-management or discounts CSV." }, { status: 400 });

    if (type === "loss") {
        const { rows, errors, date } = parseLossManagement(content);
        if (!date) return NextResponse.json({ error: "No valid complaint rows found." }, { status: 400 });
        // Apply the admin-editable reason map (override the code defaults) if any exist
        const reasonMap = await db.lossReasonMap.findMany({ where: { branchId }, orderBy: { sortOrder: "asc" } });
        if (reasonMap.length > 0) for (const r of rows) r.reasonCategory = normalizeWithMap(r.reasonRaw, reasonMap);
        const dates = [...new Set(rows.map(r => r.businessDate))];
        for (const d of dates) {
            await db.lossComplaint.deleteMany({ where: { businessDate: asDate(d), branchId } });
        }
        if (rows.length) await db.lossComplaint.createMany({
            data: rows.map(r => ({ ...r, businessDate: asDate(r.businessDate), branchId })),
        });
        for (const d of dates) {
            const count = rows.filter(r => r.businessDate === d).length;
            const existing = await db.lossUpload.findFirst({ where: { businessDate: asDate(d), branchId } });
            if (existing) {
                await db.lossUpload.update({
                    where: { id: existing.id },
                    data: { complaintCount: count, hasComplaints: true, uploadedAt: new Date() },
                });
            } else {
                await db.lossUpload.create({
                    data: { businessDate: asDate(d), complaintCount: count, hasComplaints: true, branchId },
                });
            }
        }
        return NextResponse.json({ ok: true, type, date, imported: rows.length, errors });
    }

    // discounts
    const { rows, date } = parseDiscounts(content);
    if (!date) return NextResponse.json({ error: "No valid discount rows found." }, { status: 400 });
    const dates = [...new Set(rows.map(r => r.businessDate))];
    for (const d of dates) {
        await db.lossDiscount.deleteMany({ where: { businessDate: asDate(d), branchId } });
    }
    if (rows.length) await db.lossDiscount.createMany({
        data: rows.map(r => ({ ...r, businessDate: asDate(r.businessDate), createTime: r.createTime ? new Date(r.createTime) : null, branchId })),
    });
    for (const d of dates) {
        const count = rows.filter(r => r.businessDate === d).length;
        const existing = await db.lossUpload.findFirst({ where: { businessDate: asDate(d), branchId } });
        if (existing) {
            await db.lossUpload.update({
                where: { id: existing.id },
                data: { discountCount: count, hasDiscounts: true, uploadedAt: new Date() },
            });
        } else {
            await db.lossUpload.create({
                data: { businessDate: asDate(d), discountCount: count, hasDiscounts: true, branchId },
            });
        }
    }
    return NextResponse.json({ ok: true, type, date, imported: rows.length, errors: [] });
}
