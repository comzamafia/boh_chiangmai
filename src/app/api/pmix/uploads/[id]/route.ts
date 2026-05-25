/**
 * PATCH /api/pmix/uploads/[id]
 *
 * Updates editable fields on a PmixUpload — currently:
 *   - businessDate (YYYY-MM-DD or null)
 *   - periodLabel
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!["admin", "manager", "analyst"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const body = await req.json().catch(() => ({}));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = prisma as any;

    const existing = await db.pmixUpload.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {};
    if ("businessDate" in body) {
        if (body.businessDate === null || body.businessDate === "") {
            data.businessDate = null;
        } else if (typeof body.businessDate === "string" && /^\d{4}-\d{2}-\d{2}/.test(body.businessDate)) {
            data.businessDate = new Date(body.businessDate.slice(0, 10) + "T00:00:00.000Z");
        } else {
            return NextResponse.json({ error: "Invalid businessDate (expected YYYY-MM-DD)" }, { status: 400 });
        }
    }
    if ("periodLabel" in body) {
        data.periodLabel = (body.periodLabel as string | null)?.trim() || null;
    }

    if (Object.keys(data).length === 0) {
        return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const updated = await db.pmixUpload.update({ where: { id }, data });

    logAudit({
        session,
        action:      "UPDATE",
        targetTable: "PmixUpload",
        targetId:    id,
        targetName:  updated.periodLabel ?? updated.fileName,
        oldValues:   { businessDate: existing.businessDate, periodLabel: existing.periodLabel },
        newValues:   data,
    });

    return NextResponse.json(updated);
}
