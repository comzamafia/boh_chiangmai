/**
 * POST /api/prep/move
 *   Move a task between columns. Body (one of):
 *     { date, templateId, to: "todo" }       — Task List → To-Do  (manager only)
 *     { date, boardTaskId, to: "complete" }   — To-Do → Complete   (any member)
 *     { date, boardTaskId, to: "todo" }       — Complete → To-Do   (any member, undo)
 *     { date, boardTaskId, to: "tasklist" }   — remove from board  (manager only)
 *
 * Logs activity:
 *   - "todo"     when a task enters To-Do (frequency tracking)
 *   - "complete" when a task is completed (staff performance + timestamp)
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const MANAGER = ["admin", "manager", "chef"];

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;

    const { date, templateId, boardTaskId, to } = await req.json();
    if (!date || !to) return NextResponse.json({ error: "date and to are required" }, { status: 400 });
    const isManager = MANAGER.includes(session.role);

    // Helper to confirm the user can see/act on a station
    async function assertStationAccess(stationId: string): Promise<boolean> {
        if (isManager) return true;
        const st = await prisma.prepStation.findFirst({ where: { id: stationId, branchId }, select: { memberIds: true } });
        if (!st) return false;
        return st.memberIds.length === 0 || st.memberIds.includes(session!.userId);
    }

    async function logActivity(stationId: string, stationName: string, tplId: string | null, taskName: string, action: "todo" | "complete") {
        await prisma.prepActivityLog.create({
            data: { date, stationId, stationName, templateId: tplId, taskName, action, userId: session!.userId, userName: session!.name ?? null, branchId },
        });
    }

    // ── Task List → To-Do (plan the shift) — managers only ──────────────────
    if (to === "todo" && templateId && !boardTaskId) {
        if (!isManager) return NextResponse.json({ error: "Only managers can plan the To-Do list" }, { status: 403 });
        const tpl = await prisma.prepTaskTemplate.findFirst({
            where:   { id: templateId, branchId },
            include: { station: { select: { id: true, name: true } } },
        });
        if (!tpl) return NextResponse.json({ error: "Template not found" }, { status: 404 });

        const last = await prisma.prepBoardTask.findFirst({
            where: { date, stationId: tpl.stationId, status: "todo", branchId },
            orderBy: { sortOrder: "desc" }, select: { sortOrder: true },
        });
        const created = await prisma.prepBoardTask.upsert({
            where:  { date_templateId: { date, templateId } },
            create: { date, stationId: tpl.stationId, templateId, status: "todo", todoAt: new Date(), todoBy: session.name ?? null, sortOrder: (last?.sortOrder ?? 0) + 1, branchId },
            update: { status: "todo", todoAt: new Date(), todoBy: session.name ?? null },
        });
        await logActivity(tpl.stationId, tpl.station.name, templateId, tpl.name, "todo");
        return NextResponse.json({ ok: true, boardTaskId: created.id });
    }

    // ── Board-task transitions ──────────────────────────────────────────────
    if (!boardTaskId) return NextResponse.json({ error: "boardTaskId required" }, { status: 400 });
    const bt = await prisma.prepBoardTask.findFirst({
        where:   { id: boardTaskId, branchId },
        include: { template: { select: { name: true, stationId: true, station: { select: { name: true } } } } },
    });
    if (!bt) return NextResponse.json({ error: "Board task not found" }, { status: 404 });
    if (!(await assertStationAccess(bt.stationId))) {
        return NextResponse.json({ error: "No access to this station" }, { status: 403 });
    }

    // To-Do → Complete
    if (to === "complete") {
        await prisma.prepBoardTask.update({
            where: { id: boardTaskId },
            data:  { status: "complete", completedAt: new Date(), completedBy: session.name ?? null },
        });
        await logActivity(bt.stationId, bt.template.station.name, bt.templateId, bt.template.name, "complete");
        return NextResponse.json({ ok: true });
    }

    // Complete → To-Do (undo)
    if (to === "todo") {
        await prisma.prepBoardTask.update({
            where: { id: boardTaskId },
            data:  { status: "todo", completedAt: null, completedBy: null },
        });
        return NextResponse.json({ ok: true });
    }

    // To-Do/Complete → Task List (remove from board) — managers only
    if (to === "tasklist") {
        if (!isManager) return NextResponse.json({ error: "Only managers can remove from the board" }, { status: 403 });
        await prisma.prepBoardTask.delete({ where: { id: boardTaskId } });
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Invalid 'to'" }, { status: 400 });
}
