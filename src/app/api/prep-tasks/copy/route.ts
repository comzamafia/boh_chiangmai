/**
 * POST /api/prep-tasks/copy
 *   Copy all tasks from one day into another (reset to not-done). Great for
 *   "same prep as yesterday". Skips if the target day already has tasks
 *   unless overwrite=true.
 *   Body: { fromDate, toDate, overwrite? }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { fromDate, toDate, overwrite } = await req.json();
    if (!fromDate || !toDate) {
        return NextResponse.json({ error: "fromDate and toDate are required" }, { status: 400 });
    }

    const source = await prisma.prepTask.findMany({
        where:   { date: fromDate, branchId },
        orderBy: [{ station: "asc" }, { sortOrder: "asc" }],
    });
    if (source.length === 0) {
        return NextResponse.json({ error: "No tasks to copy from that date" }, { status: 400 });
    }

    const existing = await prisma.prepTask.count({ where: { date: toDate, branchId } });
    if (existing > 0 && !overwrite) {
        return NextResponse.json(
            { error: "duplicate", duplicate: true, existingCount: existing },
            { status: 409 },
        );
    }

    await prisma.$transaction(async (tx) => {
        if (existing > 0 && overwrite) {
            await tx.prepTask.deleteMany({ where: { date: toDate, branchId } });
        }
        await tx.prepTask.createMany({
            data: source.map(t => ({
                date:      toDate,
                station:   t.station,
                name:      t.name,
                qty:       t.qty,
                dueTime:   t.dueTime,
                sortOrder: t.sortOrder,
                done:      false,
                branchId,
            })),
        });
    });

    return NextResponse.json({ copied: source.length, toDate });
}
