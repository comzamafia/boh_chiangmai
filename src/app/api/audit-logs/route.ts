import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextResponse } from "next/server";

// GET /api/audit-logs — admin + manager only
export async function GET(request: Request) {
    try {
        const ctx = await requireBranch();
        if (!isBranchContext(ctx)) return ctx;
        const { session, branchId } = ctx;
        if (!["admin", "manager"].includes(session.role)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const userId      = searchParams.get("userId")      ?? undefined;
        const action      = searchParams.get("action")      ?? undefined;
        const targetTable = searchParams.get("targetTable") ?? undefined;
        const from        = searchParams.get("from")        ?? undefined; // ISO date string
        const to          = searchParams.get("to")          ?? undefined;
        const limitStr    = searchParams.get("limit");
        const limit       = limitStr ? Math.min(500, parseInt(limitStr)) : 100;

        const logs = await prisma.auditLog.findMany({
            where: {
                branchId,
                ...(userId      ? { userId }      : {}),
                ...(action      ? { action }      : {}),
                ...(targetTable ? { targetTable } : {}),
                ...(from || to  ? {
                    createdAt: {
                        ...(from ? { gte: new Date(from) } : {}),
                        ...(to   ? { lte: new Date(to)   } : {}),
                    },
                } : {}),
            },
            orderBy: { createdAt: "desc" },
            take:    limit,
        });

        return NextResponse.json(logs);
    } catch {
        return NextResponse.json({ error: "Failed to fetch audit logs" }, { status: 500 });
    }
}
