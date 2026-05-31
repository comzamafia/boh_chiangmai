/**
 * Daily board reset: move every To-Do + Complete task back to the master
 * Task List by deleting the day's board rows. Templates remain (they ARE the
 * backlog), and the immutable PrepActivityLog is untouched, so analytics and
 * completion history survive.
 *
 * `beforeOrOn` deletes board tasks for that date and earlier (so a missed
 * run still cleans up). Defaults to today.
 */
import { prisma } from "@/lib/db";

// (rebuild marker — re-trigger deploy after a transient Neon migrate lock timeout)
export async function resetPrepBoards(beforeOrOn?: string): Promise<{ cleared: number; cutoff: string }> {
    const cutoff = beforeOrOn ?? new Date().toISOString().slice(0, 10);
    const res = await prisma.prepBoardTask.deleteMany({ where: { date: { lte: cutoff } } });
    return { cleared: res.count, cutoff };
}
