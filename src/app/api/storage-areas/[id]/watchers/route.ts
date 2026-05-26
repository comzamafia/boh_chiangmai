/**
 * /api/storage-areas/[id]/watchers
 *
 * GET    — list watchers of a storage area (with user details)
 * POST   — add a watcher: { userId, role?, ccOnly?, alertThreshold?, digestSchedule? }
 * DELETE — remove watcher by ?userId=...
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

function canManage(role: string): boolean {
    return role === "admin" || role === "manager";
}

export async function GET(_: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { id } = await ctx.params;

    const rows = await db.storageAreaWatcher.findMany({
        where: { storageAreaId: id },
        include: {
            user: { select: { id: true, name: true, email: true, role: true, department: true, isActive: true } },
        },
        orderBy: { createdAt: "asc" },
    });
    return NextResponse.json(rows);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !canManage(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: storageAreaId } = await ctx.params;
    const body = await req.json();

    if (!body.userId) {
        return NextResponse.json({ error: "userId required" }, { status: 400 });
    }

    try {
        const created = await db.storageAreaWatcher.create({
            data: {
                storageAreaId,
                userId:         body.userId,
                role:           body.role ?? "watcher",
                ccOnly:         body.ccOnly ?? false,
                alertThreshold: body.alertThreshold ?? null,
                digestSchedule: body.digestSchedule ?? null,
            },
            include: {
                user: { select: { id: true, name: true, email: true, role: true, department: true } },
            },
        });
        return NextResponse.json(created, { status: 201 });
    } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes("Unique constraint")) {
            return NextResponse.json({ error: "User already watches this area" }, { status: 409 });
        }
        throw e;
    }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !canManage(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id: storageAreaId } = await ctx.params;
    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

    await db.storageAreaWatcher.deleteMany({
        where: { storageAreaId, userId },
    });
    return NextResponse.json({ ok: true });
}
