/**
 * POST /api/notifications/run-order-reminders?hours=14
 * Admin/manager-triggered manual order-reminder run.
 */
import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { runOrderReminders } from "@/lib/notifications/triggers/order-reminder";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || (session.role !== "admin" && session.role !== "manager")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const hours = Math.max(1, Math.min(168, Number(req.nextUrl.searchParams.get("hours") ?? 14)));
    const summary = await runOrderReminders({ windowHours: hours });
    return NextResponse.json(summary);
}
