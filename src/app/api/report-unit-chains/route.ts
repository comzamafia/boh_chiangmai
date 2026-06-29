/**
 * GET /api/report-unit-chains            — list all unit chains
 * PUT /api/report-unit-chains            — upsert one  { reportKey, base, relations }
 *                                          (base empty / relations empty → delete)
 * Chains are keyed per report item ("<category>::<label>") so each row is independent.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;
    const chains = await db.reportUnitChain.findMany({ where: { reportKey: { not: null }, branchId } });
    return NextResponse.json(chains.map((c: { reportKey: string; base: string; relations: unknown }) => ({
        reportKey: c.reportKey, base: c.base, relations: c.relations,
    })));
}

export async function PUT(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const reportKey: string = String(body.reportKey ?? "").trim();
    const base: string = String(body.base ?? "").trim();
    const relations = (Array.isArray(body.relations) ? body.relations : [])
        .map((r: { from?: unknown; qty?: unknown; to?: unknown }) => ({ from: String(r.from ?? "").trim(), qty: Number(r.qty), to: String(r.to ?? "").trim() }))
        .filter((r: { from: string; qty: number; to: string }) => r.from && r.to && Number.isFinite(r.qty) && r.qty > 0);

    if (!reportKey) return NextResponse.json({ error: "reportKey is required" }, { status: 400 });

    // Empty config → remove
    if (!base || relations.length === 0) {
        await db.reportUnitChain.deleteMany({ where: { reportKey, branchId } });
        return NextResponse.json({ ok: true, deleted: true });
    }

    const existing = await db.reportUnitChain.findFirst({ where: { reportKey, branchId } });
    const saved = existing
        ? await db.reportUnitChain.update({ where: { id: existing.id }, data: { base, relations } })
        : await db.reportUnitChain.create({ data: { reportKey, base, relations, branchId } });
    return NextResponse.json({ ok: true, reportKey: saved.reportKey, base: saved.base, relations: saved.relations });
}
