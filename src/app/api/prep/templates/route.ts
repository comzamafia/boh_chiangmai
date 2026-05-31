/** POST /api/prep/templates — add a backlog task to a station's Task List. */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT = ["admin", "manager", "chef"];

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT.includes(session.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { stationId, name, qty, dueTime } = await req.json();
    if (!stationId || !name?.trim()) return NextResponse.json({ error: "stationId and name are required" }, { status: 400 });

    const last = await prisma.prepTaskTemplate.findFirst({ where: { stationId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const tpl = await prisma.prepTaskTemplate.create({
        data: { stationId, name: name.trim(), qty: qty?.trim() || null, dueTime: dueTime?.trim() || null, sortOrder: (last?.sortOrder ?? 0) + 1 },
    });
    return NextResponse.json(tpl, { status: 201 });
}
