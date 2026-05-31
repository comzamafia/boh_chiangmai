/**
 * POST /api/prep/templates/bulk
 *   Bulk-add backlog tasks to a station's Task List from a list of names.
 *   Body: { stationId, names: string[] }
 *   Skips blanks and names already present (case-insensitive).
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT = ["admin", "manager", "chef"];

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { stationId, names } = await req.json();
    if (!stationId || !Array.isArray(names)) {
        return NextResponse.json({ error: "stationId and names[] are required" }, { status: 400 });
    }

    // Clean + de-dupe within the payload
    const cleaned: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
        const name = String(raw ?? "").trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        cleaned.push(name);
    }
    if (cleaned.length === 0) return NextResponse.json({ added: 0, skipped: 0 });

    // Skip names already on this station
    const existing = await prisma.prepTaskTemplate.findMany({ where: { stationId }, select: { name: true, sortOrder: true } });
    const have = new Set(existing.map(t => t.name.toLowerCase().trim()));
    let sort = existing.reduce((m, t) => Math.max(m, t.sortOrder), 0);

    const toCreate = cleaned.filter(n => !have.has(n.toLowerCase()));
    const skipped  = cleaned.length - toCreate.length;

    if (toCreate.length > 0) {
        await prisma.prepTaskTemplate.createMany({
            data: toCreate.map(name => ({ stationId, name, sortOrder: ++sort, active: true })),
        });
    }
    return NextResponse.json({ added: toCreate.length, skipped });
}
