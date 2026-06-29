/**
 * GET  /api/protein-groups   — list protein display groups (with member ingredients)
 * POST /api/protein-groups   — create one  { name, sortOrder?, ingredientIds?:string[] }
 * Admin / manager / chef only for writes.
 *
 * A group's usage on the Main Protein tab = the sum of its member ingredients
 * (see lib/protein-report.ts). Members are managed here and via [id] PUT.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];

const INCLUDE = { members: { include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } } } };

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;
    const rows = await db.proteinGroup.findMany({ where: { branchId }, include: INCLUDE, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] });
    return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const b = await req.json();
    const name = String(b.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
    const sortOrder = Number.isFinite(Number(b.sortOrder)) ? Number(b.sortOrder) : 0;
    const ingredientIds: string[] = Array.isArray(b.ingredientIds)
        ? [...new Set(b.ingredientIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean))] as string[]
        : [];

    try {
        const row = await db.proteinGroup.create({
            data: { name, sortOrder, branchId, members: { create: ingredientIds.map(id => ({ ingredientId: id, branchId })) } },
            include: INCLUDE,
        });
        return NextResponse.json(row, { status: 201 });
    } catch (e) {
        const msg = e instanceof Error && e.message.includes("Unique") ? "A protein group with that name already exists." : "Failed to create group";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
