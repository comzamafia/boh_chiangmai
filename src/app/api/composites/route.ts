/**
 * GET  /api/composites   — list composite sub-recipes (with components)
 * POST /api/composites   — create one  { name, yieldQty, yieldUnit, notes?, components:[{ingredientId, qty, unit}] }
 * Admin / manager / chef only for writes.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];

const INCLUDE = { components: { include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } } } };

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const rows = await db.compositeRecipe.findMany({ include: INCLUDE, orderBy: { name: "asc" } });
    return NextResponse.json(rows);
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const b = await req.json();
    const name = String(b.name ?? "").trim();
    const yieldQty = Number(b.yieldQty);
    const yieldUnit = String(b.yieldUnit ?? "").trim();
    if (!name || !(yieldQty > 0) || !yieldUnit) {
        return NextResponse.json({ error: "name, yieldQty (>0) and yieldUnit are required" }, { status: 400 });
    }
    const components = (Array.isArray(b.components) ? b.components : [])
        .map((c: { ingredientId?: unknown; qty?: unknown; unit?: unknown }) => ({
            ingredientId: String(c.ingredientId ?? "").trim(), qty: Number(c.qty), unit: String(c.unit ?? "").trim(),
        }))
        .filter((c: { ingredientId: string; qty: number; unit: string }) => c.ingredientId && c.qty > 0 && c.unit);

    try {
        const row = await db.compositeRecipe.create({
            data: { name, yieldQty, yieldUnit, notes: b.notes?.trim() || null, components: { create: components } },
            include: INCLUDE,
        });
        return NextResponse.json(row, { status: 201 });
    } catch (e) {
        const msg = e instanceof Error && e.message.includes("Unique") ? "A composite with that name already exists." : "Failed to create composite";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}
