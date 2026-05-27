/**
 * PATCH  /api/pmix/item-rules/[id]  — update rule fields (admin/manager)
 * DELETE /api/pmix/item-rules/[id]  — delete rule (admin/manager)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    const body = await req.json();
    const allowed = ["pattern", "matchType", "category", "label", "priority", "isActive", "notes"] as const;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: Record<string, any> = {};
    for (const key of allowed) {
        if (key in body) data[key] = body[key];
    }
    if (data.pattern  !== undefined) data.pattern  = String(data.pattern).trim();
    if (data.label    !== undefined) data.label     = data.label?.trim() || null;
    if (data.notes    !== undefined) data.notes     = data.notes?.trim() || null;
    if (data.priority !== undefined) data.priority  = Number(data.priority);
    if (data.isActive !== undefined) data.isActive  = Boolean(data.isActive);

    const rule = await db.pmixItemRule.update({
        where: { id },
        data,
    });
    return NextResponse.json(rule);
}

export async function DELETE(
    _req: NextRequest,
    { params }: { params: Promise<{ id: string }> },
) {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await params;
    await db.pmixItemRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
}
