/**
 * GET /api/prep/board?date=YYYY-MM-DD
 *
 * Returns the Kanban board for each station the current user can see:
 *   { date, canPlan, stations: [{
 *       id, name, icon, color, canManage, progress,
 *       taskList: [{ templateId, name, qty, dueTime }],   // backlog not on board today
 *       todo:     [{ id, templateId, name, qty, dueTime }],
 *       complete: [{ id, templateId, name, qty, dueTime, completedBy, completedAt }],
 *   }] }
 *
 * Visibility: admin/manager see all stations; others see stations whose
 * memberIds is empty (open) or includes their userId.
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;

    const date = new URL(req.url).searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const isManager = ["admin", "manager", "chef"].includes(session.role);

    // Stations visible to this user
    const allStations = await prisma.prepStation.findMany({ where: { branchId }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    const stations = allStations.filter(s =>
        isManager || s.memberIds.length === 0 || s.memberIds.includes(session.userId)
    );
    const stationIds = stations.map(s => s.id);

    // Templates (backlog) for those stations
    const templates = await prisma.prepTaskTemplate.findMany({
        where:   { stationId: { in: stationIds }, active: true, branchId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });

    // Today's board tasks
    const board = await prisma.prepBoardTask.findMany({
        where:   { date, stationId: { in: stationIds }, branchId },
        include: { template: { select: { name: true, qty: true, dueTime: true } } },
        orderBy: { sortOrder: "asc" },
    });
    const onBoardTemplateIds = new Set(board.map(b => b.templateId));

    const result = stations.map(s => {
        const stTemplates = templates.filter(t => t.stationId === s.id);
        const stBoard     = board.filter(b => b.stationId === s.id);

        const taskList = stTemplates
            .filter(t => !onBoardTemplateIds.has(t.id))
            .map(t => ({ templateId: t.id, name: t.name, qty: t.qty, dueTime: t.dueTime }));

        const todo = stBoard.filter(b => b.status === "todo").map(b => ({
            id: b.id, templateId: b.templateId, name: b.template.name, qty: b.template.qty, dueTime: b.template.dueTime,
        }));
        const complete = stBoard.filter(b => b.status === "complete").map(b => ({
            id: b.id, templateId: b.templateId, name: b.template.name, qty: b.template.qty, dueTime: b.template.dueTime,
            completedBy: b.completedBy, completedAt: b.completedAt,
        }));

        const denom = todo.length + complete.length;
        const progress = denom > 0 ? Math.round((complete.length / denom) * 100) : 0;

        return {
            id: s.id, name: s.name, icon: s.icon, color: s.color,
            memberIds: s.memberIds,
            canManage: isManager,
            progress, taskList, todo, complete,
        };
    });

    return NextResponse.json({ date, canPlan: isManager, stations: result });
}
