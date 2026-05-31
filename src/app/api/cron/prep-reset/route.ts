/**
 * Vercel Cron — End-of-Day prep board reset.
 * Schedule: 0 19 * * *  (UTC) → ~02:00 Bangkok / overnight, after service.
 * Moves all To-Do + Complete tasks back to the master Task List for the
 * next day's planning. Activity log + templates are preserved.
 */
import { NextRequest, NextResponse } from "next/server";
import { resetPrepBoards } from "@/lib/prep-reset";

export const maxDuration = 30;

function authorize(req: NextRequest): boolean {
    if (req.headers.get("x-vercel-cron")) return true;
    const secret = process.env.CRON_SECRET;
    if (!secret) return true;
    return req.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
    if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const result = await resetPrepBoards();   // clears today and earlier
    return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: NextRequest) { return GET(req); }
