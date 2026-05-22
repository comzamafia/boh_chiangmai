/**
 * GET /api/pmix/uploads  — list all PMIX uploads (newest first)
 * DELETE /api/pmix/uploads?id=X — delete an upload and its items
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uploads = await (prisma as any).pmixUpload.findMany({
        orderBy: { uploadedAt: "desc" },
        take: 50,
    });
    return NextResponse.json(uploads);
}

export async function DELETE(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (prisma as any).pmixUpload.delete({ where: { id } });
    return new NextResponse(null, { status: 204 });
}
