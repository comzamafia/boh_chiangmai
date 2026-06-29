/** POST /api/prep/reset — manually reset the board (managers only). */
import { requireBranch, isBranchContext } from "@/lib/branch";
import { resetPrepBoards } from "@/lib/prep-reset";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!["admin", "manager", "chef"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const result = await resetPrepBoards(body.date, branchId);
    return NextResponse.json({ ok: true, ...result });
}
