/**
 * PUT /api/report-stations/[id]/menus  — set the station's assigned menu items
 *   body: { itemNames: string[] }   (replaces the whole assignment set)
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { id } = await params;
    const body = await req.json();
    const itemNames: string[] = Array.isArray(body.itemNames)
        ? Array.from(new Set((body.itemNames as unknown[]).map(s => String(s).trim()).filter((s): s is string => s.length > 0)))
        : [];

    const station = await db.reportStation.findUnique({ where: { id }, select: { id: true } });
    if (!station) return NextResponse.json({ error: "Station not found" }, { status: 404 });

    await db.$transaction([
        db.reportStationMenu.deleteMany({ where: { stationId: id } }),
        db.reportStationMenu.createMany({
            data: itemNames.map(itemName => ({ stationId: id, itemName })),
            skipDuplicates: true,
        }),
    ]);

    return NextResponse.json({ ok: true, count: itemNames.length, menus: itemNames });
}
