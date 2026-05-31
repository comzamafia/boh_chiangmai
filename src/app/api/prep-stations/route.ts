/**
 * GET  /api/prep-stations   — list stations (lazy-seeds the 4 defaults if empty)
 * POST /api/prep-stations   — create a station { name, icon?, color? }
 */
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];

const DEFAULTS = [
    { name: "Prep Station",  icon: "utensils",    color: "bg-orange-500", sortOrder: 0 },
    { name: "Sauce Station", icon: "droplets",    color: "bg-blue-500",   sortOrder: 1 },
    { name: "Hot Station",   icon: "flame",       color: "bg-red-500",    sortOrder: 2 },
    { name: "Cold Station",  icon: "thermometer", color: "bg-cyan-500",   sortOrder: 3 },
];

export async function GET() {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    let stations = await prisma.prepStation.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    if (stations.length === 0) {
        await prisma.prepStation.createMany({ data: DEFAULTS });
        stations = await prisma.prepStation.findMany({ orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
    }
    return NextResponse.json(stations);
}

export async function POST(req: NextRequest) {
    const session = await getSession();
    if (!session || !EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { name, icon, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const last = await prisma.prepStation.findFirst({ orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const station = await prisma.prepStation.create({
        data: {
            name:      name.trim(),
            icon:      icon  || "utensils",
            color:     color || "bg-slate-500",
            sortOrder: (last?.sortOrder ?? 0) + 1,
        },
    });
    return NextResponse.json(station, { status: 201 });
}
