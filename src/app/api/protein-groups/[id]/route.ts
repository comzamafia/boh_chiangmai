/**
 * PUT    /api/protein-groups/[id]  — update { name?, sortOrder?, ingredientIds?:string[] }
 *                                     ingredientIds, when present, REPLACES the member set.
 * DELETE /api/protein-groups/[id]  — delete the group (members cascade).
 * Admin / manager / chef only.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;
const EDIT_ROLES = ["admin", "manager", "chef"];
const INCLUDE = { members: { include: { ingredient: { select: { id: true, name: true, recipeUnit: true } } } } };

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    const b = await req.json();

    const data: { name?: string; sortOrder?: number } = {};
    if (typeof b.name === "string" && b.name.trim()) data.name = b.name.trim();
    if (Number.isFinite(Number(b.sortOrder))) data.sortOrder = Number(b.sortOrder);

    try {
        await db.$transaction(async (tx: typeof db) => {
            if (Object.keys(data).length) await tx.proteinGroup.update({ where: { id }, data });
            if (Array.isArray(b.ingredientIds)) {
                const ids = [...new Set(b.ingredientIds.map((x: unknown) => String(x ?? "").trim()).filter(Boolean))] as string[];
                await tx.proteinGroupMember.deleteMany({ where: { groupId: id } });
                if (ids.length) await tx.proteinGroupMember.createMany({ data: ids.map(ingredientId => ({ groupId: id, ingredientId })) });
            }
        });
        const row = await db.proteinGroup.findUnique({ where: { id }, include: INCLUDE });
        return NextResponse.json(row);
    } catch (e) {
        const msg = e instanceof Error && e.message.includes("Unique") ? "A protein group with that name already exists." : "Failed to update group";
        return NextResponse.json({ error: msg }, { status: 400 });
    }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const { id } = await params;
    try {
        await db.proteinGroup.delete({ where: { id } });
        return new NextResponse(null, { status: 204 });
    } catch {
        return NextResponse.json({ error: "Failed to delete group" }, { status: 400 });
    }
}
