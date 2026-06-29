/**
 * GET  /api/report-stations   — list stations with their assigned menu item names
 * POST /api/report-stations   — create a station { name, icon?, color? }
 */
import { prisma } from "@/lib/db";
import { requireBranch, isBranchContext } from "@/lib/branch";
import { NextRequest, NextResponse } from "next/server";

const EDIT_ROLES = ["admin", "manager", "chef"];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = prisma as any;

export async function GET() {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { branchId } = ctx;

    const stations = await db.reportStation.findMany({
        where: { branchId },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: { menus: { orderBy: { itemName: "asc" } } },
    });
    return NextResponse.json(stations.map((s: {
        id: string; name: string; icon: string; color: string; sortOrder: number;
        menus: { itemName: string }[];
    }) => ({
        id: s.id, name: s.name, icon: s.icon, color: s.color, sortOrder: s.sortOrder,
        menus: s.menus.map(m => m.itemName),
    })));
}

export async function POST(req: NextRequest) {
    const ctx = await requireBranch();
    if (!isBranchContext(ctx)) return ctx;
    const { session, branchId } = ctx;
    if (!EDIT_ROLES.includes(session.role)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { name, icon, color } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name is required" }, { status: 400 });

    const last = await db.reportStation.findFirst({ where: { branchId }, orderBy: { sortOrder: "desc" }, select: { sortOrder: true } });
    const station = await db.reportStation.create({
        data: {
            name:      name.trim(),
            icon:      icon  || "utensils",
            color:     color || "bg-slate-500",
            sortOrder: (last?.sortOrder ?? 0) + 1,
            branchId,
        },
    });
    return NextResponse.json({ ...station, menus: [] }, { status: 201 });
}
