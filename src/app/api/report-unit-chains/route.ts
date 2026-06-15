/**
 * GET /api/report-unit-chains            — list all unit chains
 * PUT /api/report-unit-chains            — upsert one  { reportKey, base, relations }
 *                                          (base empty / relations empty → delete)
 * Chains are keyed per report item ("<category>::<label>") so each row is independent.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const chains = await db.reportUnitChain.findMany({ where: { reportKey: { not: null } } });
    return NextResponse.json(chains.map((c: { reportKey: string; base: string; relations: unknown }) => ({
        reportKey: c.reportKey, base: c.base, relations: c.relations,
    })));
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
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
        await db.reportUnitChain.deleteMany({ where: { reportKey } });
        return NextResponse.json({ ok: true, deleted: true });
    }

    const saved = await db.reportUnitChain.upsert({
        where:  { reportKey },
        update: { base, relations },
        create: { reportKey, base, relations },
    });
    return NextResponse.json({ ok: true, reportKey: saved.reportKey, base: saved.base, relations: saved.relations });
}
