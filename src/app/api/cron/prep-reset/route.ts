/**
 * Vercel Cron — End-of-Day prep board reset.
 * Schedule: 0 19 * * *  (UTC) → ~02:00 Bangkok / overnight, after service.
 * Moves all To-Do + Complete tasks back to the master Task List for the
 * next day's planning. Activity log + templates are preserved.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
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
    const branches = await prisma.branch.findMany({ where: { isActive: true }, select: { id: true, slug: true } });
    const results = [];
    for (const b of branches) {
        const result = await resetPrepBoards(undefined, b.id);   // clears today and earlier, per branch
        results.push({ branch: b.slug, ...result });
    }
    return NextResponse.json({ ok: true, branches: results });
}

export async function POST(req: NextRequest) { return GET(req); }
