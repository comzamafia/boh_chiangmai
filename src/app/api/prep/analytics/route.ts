/**
 * GET /api/prep/analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * From the immutable PrepActivityLog:
 *   stationFrequency : per station, the tasks most often put on To-Do
 *                      (distinct days + completion counts) — find labour-heavy
 *                      prep to cross-reference with ingredient usage.
 *   staffPerformance : completed tasks per person per day — productivity.
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
    const session = await getSession();
    if (!session || !["admin", "manager", "chef"].includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { searchParams } = new URL(req.url);
    const to   = searchParams.get("to")   ?? new Date().toISOString().slice(0, 10);
    const from = searchParams.get("from") ?? to;

    const logs = await prisma.prepActivityLog.findMany({
        where:  { date: { gte: from, lte: to } },
        select: { date: true, stationName: true, taskName: true, action: true, userName: true },
    });

    // ── Station frequency (by To-Do placements) ──────────────────────────────
    // key: station|||task → { todoDays:Set, todoCount, completeCount }
    const freq = new Map<string, { station: string; task: string; days: Set<string>; todo: number; complete: number }>();
    for (const l of logs) {
        const key = `${l.stationName}|||${l.taskName}`;
        let row = freq.get(key);
        if (!row) { row = { station: l.stationName, task: l.taskName, days: new Set(), todo: 0, complete: 0 }; freq.set(key, row); }
        if (l.action === "todo")     { row.todo++; row.days.add(l.date); }
        if (l.action === "complete") { row.complete++; }
    }
    const stationFrequency = [...freq.values()]
        .map(r => ({ station: r.station, task: r.task, daysScheduled: r.days.size, timesScheduled: r.todo, timesCompleted: r.complete }))
        .sort((a, b) => b.timesScheduled - a.timesScheduled || b.timesCompleted - a.timesCompleted);

    // ── Staff performance (completions) ──────────────────────────────────────
    // person → { total, days:Set }
    const staff = new Map<string, { name: string; total: number; days: Set<string> }>();
    for (const l of logs) {
        if (l.action !== "complete") continue;
        const name = l.userName ?? "Unknown";
        let row = staff.get(name);
        if (!row) { row = { name, total: 0, days: new Set() }; staff.set(name, row); }
        row.total++; row.days.add(l.date);
    }
    const staffPerformance = [...staff.values()]
        .map(r => ({ name: r.name, completed: r.total, daysActive: r.days.size, avgPerDay: r.days.size > 0 ? +(r.total / r.days.size).toFixed(1) : 0 }))
        .sort((a, b) => b.completed - a.completed);

    return NextResponse.json({ from, to, stationFrequency, staffPerformance });
}
