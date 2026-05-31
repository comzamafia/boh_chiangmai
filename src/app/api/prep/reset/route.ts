/** POST /api/prep/reset — manually reset the board (managers only). */
import { getSession } from "@/lib/auth";
import { resetPrepBoards } from "@/lib/prep-reset";
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json().catch(() => ({}));
    const result = await resetPrepBoards(body.date);
    return NextResponse.json({ ok: true, ...result });
}
