/**
 * GET /api/pmix/uploads  — list all PMIX uploads (newest first)
 * DELETE /api/pmix/uploads?id=X — delete an upload and its items
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploads = await (prisma as any).pmixUpload.findMany({
        where: { branchId },
        orderBy: [{ businessDate: "desc" }, { uploadedAt: "desc" }],
        take: 200,
    });
    return NextResponse.json(uploads);
}

export async function DELETE(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma as any).pmixUpload.findFirst({ where: { id, branchId }, select: { id: true } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).pmixUpload.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
