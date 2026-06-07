/**
 * GET /api/report-unit-chains            — list all unit chains
 * PUT /api/report-unit-chains            — upsert one  { ingredientId, base, relations }
 *                                          (base empty / relations empty → delete)
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
    const chains = await db.reportUnitChain.findMany();
    return NextResponse.json(chains.map((c: { ingredientId: string; base: string; relations: unknown }) => ({
        ingredientId: c.ingredientId, base: c.base, relations: c.relations,
    })));
}

export async function PUT(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const ingredientId: string = body.ingredientId;
    const base: string = String(body.base ?? "").trim();
    const relations = (Array.isArray(body.relations) ? body.relations : [])
        .map((r: { from?: unknown; qty?: unknown; to?: unknown }) => ({ from: String(r.from ?? "").trim(), qty: Number(r.qty), to: String(r.to ?? "").trim() }))
        .filter((r: { from: string; qty: number; to: string }) => r.from && r.to && Number.isFinite(r.qty) && r.qty > 0);

    if (!ingredientId) return NextResponse.json({ error: "ingredientId is required" }, { status: 400 });

    // Empty config → remove
    if (!base || relations.length === 0) {
        await db.reportUnitChain.deleteMany({ where: { ingredientId } });
        return NextResponse.json({ ok: true, deleted: true });
    }

    const saved = await db.reportUnitChain.upsert({
        where:  { ingredientId },
        update: { base, relations },
        create: { ingredientId, base, relations },
    });
    return NextResponse.json({ ok: true, ingredientId: saved.ingredientId, base: saved.base, relations: saved.relations });
}
