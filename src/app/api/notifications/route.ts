/**
 * GET /api/notifications — list NotificationLog entries (admin only)
 * Query params: type, storageAreaId, status, limit (default 100, max 500)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (session.role !== "admin" && session.role !== "manager") {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const sp = req.nextUrl.searchParams;
    const limit = Math.max(1, Math.min(500, Number(sp.get("limit") ?? 100)));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { branchId };
    const type          = sp.get("type");
    const storageAreaId = sp.get("storageAreaId");
    const status        = sp.get("status");
    if (type)          where.type          = type;
    if (storageAreaId) where.storageAreaId = storageAreaId;
    if (status)        where.status        = status;

    const rows = await db.notificationLog.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take:    limit,
    });
    return NextResponse.json(rows);
}
