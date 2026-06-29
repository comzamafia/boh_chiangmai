/**
 * GET  /api/prep-tasks?date=YYYY-MM-DD   — tasks for a day (defaults today)
 * POST /api/prep-tasks                   — create a task
 *   Body: { date, station, name, qty?, dueTime? }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const tasks = await prisma.prepTask.findMany({
        where:   { date, branchId },
        orderBy: [{ station: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(tasks);
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const body = await req.json();
    const { date, station, name, qty, dueTime } = body;
    if (!date || !station || !name?.trim()) {
        return NextResponse.json({ error: "date, station and name are required" }, { status: 400 });
    }

    // Append to the end of that station's list
    const last = await prisma.prepTask.findFirst({
        where:   { date, station, branchId },
        orderBy: { sortOrder: "desc" },
        select:  { sortOrder: true },
    });

    const task = await prisma.prepTask.create({
        data: {
            date,
            station,
            name:      name.trim(),
            qty:       qty?.trim()     || null,
            dueTime:   dueTime?.trim() || null,
            sortOrder: (last?.sortOrder ?? 0) + 1,
            branchId,
        },
    });
    return NextResponse.json(task, { status: 201 });
}
